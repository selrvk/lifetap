import type { Report, ReportEntry } from '../src/types/responder';

type Storage = typeof import('../src/storage/asyncStorage');

let S: Storage;
let store: Map<string, string>;
let setItem: jest.Mock;

// Fresh module (and fresh in-memory Keychain) per test: the storage module
// keeps its one-time migration state in memory.
beforeEach(() => {
  jest.resetModules();
  S = require('../src/storage/asyncStorage');
  const ES = require('react-native-encrypted-storage').default;
  store = ES.__store;
  setItem = ES.setItem;
});

function report(id: string, extra: Partial<Report> = {}): Report {
  return {
    id,
    ownerId: 'user-1',
    name: `Report ${id}`,
    date: '2026-09-12',
    location: 'Batangas City',
    responderName: 'Ana Reyes',
    responderPhone: '+639170000001',
    city: 'Batangas City',
    isActive: false,
    entries: [],
    createdAt: 1,
    updatedAt: 1,
    syncedToCloud: false,
    ...extra,
  };
}

function entry(tagId: string, extra: Partial<ReportEntry> = {}): ReportEntry {
  return {
    id: `${tagId}-1`, tagId, n: `Victim ${tagId}`, bt: 'O+', dob: '', a: [], c: [], meds: [],
    kin: [], scannedAt: 1, smsSent: false, ...extra,
  };
}

test('migrates the old single-blob layout, keeping the list copy over the stale active copy', async () => {
  const r2 = report('r2', { entries: [entry('t1', { smsSent: true })] });
  store.set('@lifetap_reports', JSON.stringify([report('r1'), r2]));
  // The old code sometimes left the active copy behind the list (smsSent false here).
  store.set('@lifetap_active_report', JSON.stringify({ ...r2, entries: [entry('t1')] }));

  const all = await S.getAllReports();

  expect(all.map((r) => r.id)).toEqual(['r1', 'r2']);
  expect(all.find((r) => r.id === 'r2')?.isActive).toBe(true);
  expect(all.find((r) => r.id === 'r1')?.isActive).toBe(false);
  expect(all.find((r) => r.id === 'r2')?.entries[0].smsSent).toBe(true);
  expect(store.has('@lifetap_reports')).toBe(false);
  expect(store.has('@lifetap_active_report')).toBe(false);
  expect(store.has('lifetap:report:r1')).toBe(true);
});

test('a scan writes only the report it changes', async () => {
  await S.saveReport(report('r1'));
  await S.saveReport(report('r2'));
  setItem.mockClear();

  await S.addEntryToReport('r1', entry('t1'));

  expect(setItem.mock.calls.map((c) => c[0])).toEqual(['lifetap:report:r1']);
  expect((await S.getReportById('r1'))?.entries).toHaveLength(1);
  expect((await S.getReportById('r2'))?.entries).toHaveLength(0);
});

test('rescanning the same tag does not add a duplicate', async () => {
  await S.saveReport(report('r1'));
  await S.addEntryToReport('r1', entry('t1'));
  await S.addEntryToReport('r1', entry('t1', { id: 't1-2' }));
  expect((await S.getReportById('r1'))?.entries).toHaveLength(1);
});

test('scans that land at the same time are all kept', async () => {
  await S.saveReport(report('r1'));
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => S.addEntryToReport('r1', entry(`t${i}`)))
  );
  expect((await S.getReportById('r1'))?.entries).toHaveLength(10);
});

test('the active report is stored as an id and derived on read', async () => {
  await S.saveReport(report('r1'));
  await S.setActiveReport(report('r2')); // not saved yet → saved on activation

  expect((await S.getActiveReport())?.id).toBe('r2');
  const all = await S.getAllReports();
  expect(all.filter((r) => r.isActive).map((r) => r.id)).toEqual(['r2']);
  expect(store.get('lifetap:report:r2')).not.toContain('isActive');

  await S.setActiveReport(null);
  await S.setActiveReport(null); // clearing twice must not throw (iOS rejects removing a missing item)
  expect(await S.getActiveReport()).toBeNull();
});

test('a report that changed during its upload stays unsynced', async () => {
  await S.saveReport(report('r1', { updatedAt: 100 }));
  const uploaded = await S.getReportById('r1'); // snapshot sent to the cloud

  await S.addEntryToReport('r1', entry('t1')); // scan lands mid-upload
  await S.markReportSynced('r1', uploaded!.updatedAt);
  expect((await S.getReportById('r1'))?.syncedToCloud).toBe(false);

  const current = await S.getReportById('r1');
  await S.markReportSynced('r1', current!.updatedAt);
  expect((await S.getReportById('r1'))?.syncedToCloud).toBe(true);
});

test('updating a victim entry marks the report for re-sync', async () => {
  await S.saveReport(report('r1', { syncedToCloud: true, entries: [entry('t1')] }));
  await S.updateReportEntry('r1', 't1-1', { smsSent: true });
  const r = await S.getReportById('r1');
  expect(r?.entries[0].smsSent).toBe(true);
  expect(r?.syncedToCloud).toBe(false);
});

test('deleting the active report removes it and clears the active id', async () => {
  await S.saveReport(report('r1'));
  await S.setActiveReport(report('r1'));
  await S.deleteReport('r1');
  expect(await S.getAllReports()).toEqual([]);
  expect(await S.getActiveReport()).toBeNull();
});

test('ownership: by account id, falling back to phone for older reports', () => {
  const owner = { userId: 'user-1', phone: '+639170000001' };
  expect(S.isReportOwnedBy(report('r1'), owner)).toBe(true);
  expect(S.isReportOwnedBy(report('r1', { ownerId: 'user-2' }), owner)).toBe(false);
  expect(S.isReportOwnedBy(report('r1', { ownerId: undefined }), owner)).toBe(true);
  expect(S.isReportOwnedBy(report('r1', { ownerId: undefined, responderPhone: '+639999' }), owner)).toBe(false);
  expect(S.isReportOwnedBy(report('r1'), null)).toBe(false);
});
