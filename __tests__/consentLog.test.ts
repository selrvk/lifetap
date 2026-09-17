import type { ConsentRecord, LocalUser } from '../src/storage/asyncStorage';

type Storage = typeof import('../src/storage/asyncStorage');
type Log = typeof import('../src/services/consentLog');

let S: Storage;
let L: Log;
let upsert: jest.Mock;

// Fresh modules and in-memory Keychain per test; the Supabase client is
// replaced so nothing touches the network.
beforeEach(() => {
  jest.resetModules();
  upsert = jest.fn().mockResolvedValue({ error: null });
  jest.doMock('../src/lib/supabase', () => ({
    supabase: { from: jest.fn(() => ({ upsert })) },
  }));
  S = require('../src/storage/asyncStorage');
  L = require('../src/services/consentLog');
});

function consent(extra: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    version: '2026-09-v3', acceptedAt: 1, updatedAt: 1, smsAlerts: false,
    cloudBackup: false, cloudBackupAt: null, contactsConfirmed: false, guardian: null,
    ...extra,
  };
}

function user(extra: Partial<LocalUser> = {}): LocalUser {
  return {
    id: 'lt-1', n: 'Juan', dob: '', bt: 'O+', brg: '', cty: '', phn: '09171234567',
    rel: '', od: false, is_public: false, a: [], c: [], meds: [], kin: [],
    lastModified: 1, syncedToTag: false, syncedToCloud: false, consent: consent(),
    ...extra,
  };
}

async function signIn() {
  await S.saveCloudSession({
    access_token: 'a', refresh_token: 'r', phone: '+639170000001', user_id: 'user-1',
    expires_at: Date.now() + 3600_000, role: null, full_name: null, city: null,
    badge_no: null, organization: null, personnel_verified_at: null,
  });
}

describe('consentChangeKind — which history entry a consent save makes', () => {
  test('first consent, new notice version, changed choice, no change', () => {
    expect(L.consentChangeKind(undefined, consent())).toBe('given');
    expect(L.consentChangeKind(consent({ version: '2026-09-v2' }), consent())).toBe('renewed');
    expect(L.consentChangeKind(consent(), consent({ smsAlerts: true }))).toBe('changed');
    expect(L.consentChangeKind(consent(), consent({ guardian: { name: 'Maria', relationship: 'Mother' } }))).toBe('changed');
    // Only the timestamp moved (e.g. saving the form unchanged): nothing to record.
    expect(L.consentChangeKind(consent(), consent({ updatedAt: 99 }))).toBeNull();
  });
});

describe('consent history on the phone', () => {
  test('without cloud backup, events stay on the phone and nothing is uploaded', async () => {
    await signIn();
    const u = user();
    await S.saveLocalUser(u);
    await L.recordConsentEvent('given', u);

    const log = await S.getConsentLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'given', profileId: 'lt-1', uploaded: false, noticeVersion: '2026-09-v3' });
    expect(upsert).not.toHaveBeenCalled();
  });

  test('with cloud backup, pending events upload once and are marked uploaded', async () => {
    await signIn();
    const u = user({ consent: consent({ cloudBackup: true }) });
    await S.saveLocalUser(u);
    await L.recordConsentEvent('given', u);
    await L.recordConsentEvent('changed', u);

    expect((await S.getConsentLog()).every((e) => e.uploaded)).toBe(true);
    const uploadedIds = upsert.mock.calls.flatMap(([rows]) => rows.map((r: { id: string }) => r.id));
    expect(new Set(uploadedIds).size).toBe(2);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ owner_id: 'user-1', event: 'given' });
  });

  test('a failed upload leaves events pending for the next try', async () => {
    await signIn();
    upsert.mockResolvedValueOnce({ error: { message: 'offline' } });
    const u = user({ consent: consent({ cloudBackup: true }) });
    await S.saveLocalUser(u);
    await L.recordConsentEvent('cloud_backup_given', u);
    expect((await S.getConsentLog())[0].uploaded).toBe(false);

    await L.uploadPendingConsentEvents();
    expect((await S.getConsentLog())[0].uploaded).toBe(true);
  });

  test('marking uploads done never drops an event appended at the same time', async () => {
    const event = (id: string) => ({
      id, kind: 'changed' as const, at: 1, noticeVersion: 'v', profileId: 'lt-1', choices: null, uploaded: false,
    });
    await S.appendConsentEvent(event('a'));
    await Promise.all([
      S.markConsentEventsUploaded(['a']),
      ...['b', 'c', 'd'].map((id) => S.appendConsentEvent(event(id))),
    ]);
    const log = await S.getConsentLog();
    expect(log.map((e) => e.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(log.find((e) => e.id === 'a')!.uploaded).toBe(true);
  });

  test('clearing the log erases it', async () => {
    await L.recordConsentEvent('given', user());
    await S.clearConsentLog();
    expect(await S.getConsentLog()).toEqual([]);
  });
});
