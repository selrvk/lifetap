import type { LocalUser } from '../src/storage/asyncStorage';

type Storage = typeof import('../src/storage/asyncStorage');
type Nfc = typeof import('../src/services/nfc');

let S: Storage;
let N: Nfc;

beforeEach(() => {
  jest.resetModules();
  S = require('../src/storage/asyncStorage');
  N = require('../src/services/nfc');
});

describe('parseTagPayload — tags come from the physical world', () => {
  test('rejects anything that is not a LifeTap profile', () => {
    for (const bad of [null, 42, 'text', [], {}, { id: 'lt-1' }, { n: 'Juan' }, { id: '  ', n: 'Juan' }]) {
      expect(N.parseTagPayload(bad)).toBeNull();
    }
  });

  test('fills every missing field so screens never see undefined', () => {
    const p = N.parseTagPayload({ id: 'lt-1', n: 'Juan' })!;
    expect(p).toMatchObject({
      dob: '', bt: '', brg: '', cty: '', phn: '', rel: '',
      od: false, is_public: false, a: [], c: [], meds: [], kin: [],
    });
  });

  test('coerces wrong types and drops junk entries', () => {
    const p = N.parseTagPayload({
      id: 'lt-1', n: 'Juan', phn: 5, a: 'Penicillin', c: ['Asthma', 3, ''],
      kin: [null, 'x', { n: 'Maria', p: 9171 }, {}], is_public: 'true', od: 1,
    })!;
    expect(p.phn).toBe('');
    expect(p.a).toEqual([]);
    expect(p.c).toEqual(['Asthma']);
    expect(p.kin).toEqual([{ n: 'Maria', p: '', r: '' }]);
    expect(p.is_public).toBe(false); // only a real `true` makes a profile public
    expect(p.od).toBe(false);
  });

  test('SMS consent: missing (older tags) means allowed, false means not', () => {
    expect(N.parseTagPayload({ id: 'lt-1', n: 'Juan' })!.sms).toBe(true);
    expect(N.parseTagPayload({ id: 'lt-1', n: 'Juan', sms: false })!.sms).toBe(false);
  });
});

describe('getSyncStatus — when the Home screen asks for a tag rewrite', () => {
  async function setup(user: Partial<LocalUser>) {
    await S.saveCloudSession({
      access_token: 'a', refresh_token: 'r', phone: '+639170000001', user_id: 'user-1',
      expires_at: Date.now() + 3600_000, role: null, full_name: null, city: null,
      badge_no: null, organization: null, personnel_verified_at: null,
    });
    await S.saveLocalUser({
      id: 'lt-1', n: 'Juan', dob: '', bt: 'O+', brg: '', cty: '', phn: '09171234567',
      rel: '', od: false, is_public: false, a: [], c: [], meds: [], kin: [],
      lastModified: 1, syncedToTag: true, syncedToCloud: true,
      tagFormat: 2, tagKeyId: 1,
      ...user,
    });
  }

  test('an encrypted tag sealed to the current key is up to date', async () => {
    await setup({});
    expect(await S.getSyncStatus(1)).toBe('IN_SYNC');
  });

  test('a tag sealed to a rotated-out key must be rewritten', async () => {
    await setup({});
    expect(await S.getSyncStatus(2)).toBe('TAG_BEHIND');
  });

  test('a public profile has nothing sealed, so rotation does not matter', async () => {
    await setup({ is_public: true, tagKeyId: 0 });
    expect(await S.getSyncStatus(2)).toBe('IN_SYNC');
  });

  test('a plaintext tag from before encryption must be rewritten', async () => {
    await setup({ tagFormat: undefined });
    expect(await S.getSyncStatus(1)).toBe('TAG_BEHIND');
  });

  test('encrypted tags written before rotation existed count as key 1', async () => {
    await setup({ tagKeyId: undefined });
    expect(await S.getSyncStatus(1)).toBe('IN_SYNC');
    expect(await S.getSyncStatus(2)).toBe('TAG_BEHIND');
  });

  // Settings and Profile show tag status too; they used to read syncedToTag
  // alone and reported plaintext tags as "Synced" while Home said otherwise.
  test('isTagCurrent agrees with Home even when syncedToTag is true', async () => {
    await setup({ tagFormat: undefined });
    const user = (await S.getLocalUser())!;
    expect(user.syncedToTag).toBe(true);
    expect(S.isTagCurrent(user, 1)).toBe(false);
    expect(S.isTagCurrent({ ...user, tagFormat: 2 }, 1)).toBe(true);
  });
});
