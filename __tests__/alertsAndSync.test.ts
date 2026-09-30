// SMS alert failures, report upload errors, responder key refresh cadence and
// devices without NFC — the messages a responder or civilian actually sees.

const invoke = jest.fn();

beforeEach(() => {
  jest.resetModules();
  invoke.mockReset();
  jest.doMock('../src/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
  require('react-native-encrypted-storage').default.__store.clear();
});

const victim = (phones: string[]) => ({
  id: 'e1', tagId: 'lt-1', n: 'Juan Dela Cruz', bt: 'O+', dob: '', a: [], c: [], meds: [],
  kin: phones.map((p, i) => ({ n: `Kin ${i}`, p, r: 'Mother' })),
  scannedAt: 0, smsSent: false,
});

describe('sendVictimAlert', () => {
  test('no PH mobile numbers: says so without calling the server', async () => {
    const { sendVictimAlert } = require('../src/services/sms');
    const res = await sendVictimAlert(victim(['12345', '']), 'Batangas City');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Philippine mobile number/);
    expect(invoke).not.toHaveBeenCalled();
  });

  test('offline: explains that SMS needs a signal and to call instead', async () => {
    const { FunctionsFetchError } = require('@supabase/supabase-js');
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('Network request failed')) });
    const { sendVictimAlert } = require('../src/services/sms');
    const res = await sendVictimAlert(victim(['09171234567']), 'Batangas City');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/No internet connection/);
    expect(res.message).toMatch(/Call the emergency contacts/);
  });

  test('server refusals map to plain sentences, never "non-2xx status code"', async () => {
    const { FunctionsHttpError } = require('@supabase/supabase-js');
    const { sendVictimAlert } = require('../src/services/sms');
    const cases: [number, RegExp][] = [[401, /session has expired/], [403, /active personnel/], [429, /last hour/], [502, /couldn’t deliver/], [500, /isn’t available/]];
    for (const [status, expected] of cases) {
      invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError({ status }) });
      const res = await sendVictimAlert(victim(['09171234567']), 'X');
      expect(res.message).toMatch(expected);
      expect(res.message).not.toMatch(/non-2xx/);
    }
  });

  test('partial delivery reports how many of the requested numbers got it', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, results: [{ to: '+639171234567', ok: true }, { to: '+639181234567', ok: false }] },
      error: null,
    });
    const { sendVictimAlert } = require('../src/services/sms');
    const res = await sendVictimAlert(victim(['09171234567', '+63 918 123 4567', '09171234567']), 'X');
    expect(res).toEqual({ ok: true, sentTo: ['+639171234567'], requested: 2 });
  });
});

describe('reportSyncErrorMessage', () => {
  const reportSyncErrorMessage = (e: { code?: string; message?: string }) =>
    require('../src/services/reports').reportSyncErrorMessage(e);

  test('an RLS refusal points at the personnel city, not the database', () => {
    const msg = reportSyncErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "reports"' });
    expect(msg).toMatch(/city on your personnel record/);
    expect(msg).not.toMatch(/row-level security/);
  });

  test('network failures say the report uploads later by itself', () => {
    expect(reportSyncErrorMessage({ message: 'TypeError: Network request failed' })).toMatch(/uploads automatically/);
  });

  test('anything else keeps the detail and reassures it is saved', () => {
    expect(reportSyncErrorMessage({ message: 'boom' })).toMatch(/\(boom\).*saved on this phone/);
  });
});

describe('responder key refresh', () => {
  const DAY = 24 * 60 * 60 * 1000;

  test('keysNeedRefresh: missing keys, unknown age, a day old, or a clock set back', () => {
    const { keysNeedRefresh } = require('../src/crypto/keys');
    const now = 10 * DAY;
    expect(keysNeedRefresh(false, now, now)).toBe(true);
    expect(keysNeedRefresh(true, null, now)).toBe(true);
    expect(keysNeedRefresh(true, now - DAY, now)).toBe(true);
    expect(keysNeedRefresh(true, now + 5000, now)).toBe(true);
    expect(keysNeedRefresh(true, now - DAY + 60_000, now)).toBe(false);
  });

  test('downloads once, then not again on the next foreground the same day', async () => {
    invoke.mockResolvedValue({ data: { keys: { 1: 'ab'.repeat(32) } }, error: null });
    const keys = require('../src/crypto/keys');
    await keys.refreshResponderKeysIfStale();
    await keys.refreshResponderKeysIfStale();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await keys.hasResponderKeys()).toBe(true);
  });

  test('a keyring saved by an older build (no timestamp) is refreshed once', async () => {
    const store = require('react-native-encrypted-storage').default.__store;
    store.set('lifetap:responder_keys', JSON.stringify({ 1: 'cd'.repeat(32) }));
    invoke.mockResolvedValue({ data: { keys: { 1: 'cd'.repeat(32), 2: 'ef'.repeat(32) } }, error: null });
    const keys = require('../src/crypto/keys');
    await keys.refreshResponderKeysIfStale();
    await keys.refreshResponderKeysIfStale();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test('clearing removes the timestamp too, so the next account downloads fresh', async () => {
    invoke.mockResolvedValue({ data: { keys: { 1: 'ab'.repeat(32) } }, error: null });
    const keys = require('../src/crypto/keys');
    await keys.refreshResponderKeysIfStale();
    await keys.clearResponderKeys();
    await keys.refreshResponderKeysIfStale();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('devices without NFC', () => {
  test('reading throws NFC_UNAVAILABLE instead of a generic failed scan', async () => {
    const NfcManager = require('react-native-nfc-manager').default;
    jest.spyOn(NfcManager, 'isSupported').mockResolvedValue(false);
    const nfc = require('../src/services/nfc');
    await expect(nfc.readNfcTag()).rejects.toThrow(nfc.NFC_UNAVAILABLE);
  });

  test('writing returns no_nfc (when the build has tag keys)', async () => {
    jest.doMock('react-native-config', () => ({
      __esModule: true,
      default: { SUPABASE_URL: 'https://t.supabase.co', SUPABASE_ANON_KEY: 'k', TAG_APP_SECRET: '11'.repeat(32), TAG_RESPONDER_PUBLIC_KEY: '22'.repeat(32) },
    }));
    const NfcManager = require('react-native-nfc-manager').default;
    jest.spyOn(NfcManager, 'isSupported').mockResolvedValue(false);
    const nfc = require('../src/services/nfc');
    expect(await nfc.eraseNfcTag()).toEqual({ ok: false, reason: 'no_nfc' });
  });
});
