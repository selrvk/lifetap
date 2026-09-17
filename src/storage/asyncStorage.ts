import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import type { Report, ReportEntry } from '../types/responder';
import { PRIVACY_NOTICE_VERSION } from '../legal/privacyNotice';
import { TAG_FORMAT_VERSION } from '../crypto/tagFormat';

// ================================================
// TYPES
// ================================================

export type Kin = {
  n: string; // name
  p: string; // phone
  r: string; // relationship
};

export type LocalUser = {
  // Identity
  id: string;           // matches NFC tag ID e.g. 'lt-1'
  n: string;            // full name
  dob: string;          // 'YYYY-MM-DD'
  bt: string;           // blood type
  brg: string;          // barangay
  cty: string;          // city
  phn: string;          // phone number
  rel: string;          // religion
  od: boolean;          // organ donor
  is_public: boolean;   // show full info to anyone

  // Medical
  a: string[];          // allergies
  c: string[];          // conditions
  meds: string[];       // medications
  kin: Kin[];           // next of kin

  // Sync metadata
  lastModified: number; // Unix timestamp (Date.now())
  syncedToTag: boolean;
  syncedToCloud: boolean;

  // Data Privacy Act consent. Missing on profiles created before the consent
  // flow — see hasCurrentConsent().
  consent?: ConsentRecord;

  // Format of the payload last written to the tag. Tags from before
  // encryption have none, so getSyncStatus reports them as out of date.
  tagFormat?: number;
  // Responder key the tag's medical section is sealed to (0 = public profile,
  // no sealed section). After a key rotation, older tags show as out of date.
  // Missing on v2 tags written before rotation existed — those used key 1.
  tagKeyId?: number;
};

export type ConsentRecord = {
  version: string;            // privacy notice version accepted
  acceptedAt: number;         // Unix ms the notice was accepted
  updatedAt: number;          // Unix ms of the last change to any choice below
  smsAlerts: boolean;         // optional: responders may text emergency contacts
  cloudBackup: boolean;       // optional: asked just-in-time at first cloud upload
  cloudBackupAt: number | null;
  contactsConfirmed: boolean; // user confirmed their emergency contacts agreed to be listed
  // Set when a parent/guardian gave consent (minor, or person unable to consent)
  guardian: { name: string; relationship: string } | null;
};

export function hasCurrentConsent(user: LocalUser | null): boolean {
  return user?.consent?.version === PRIVACY_NOTICE_VERSION;
}

export type PersonnelSession = {
  phone: string;
  full_name: string;
  role: 'medic' | 'responder' | 'admin';
  city: string | null;
  loggedInAt: number;
};

export type AppSettings = {
  appLockEnabled: boolean;
  lockMethod: 'faceid' | 'pin';
  onboardingComplete: boolean;
  // Responder confidentiality undertaking, keyed by Supabase user id.
  responderUndertakings?: Record<string, { version: string; acceptedAt: number }>;
};

// ================================================
// CLOUD SESSION
// Stores Supabase auth session after OTP login
// ================================================

export type CloudSession = {
  access_token: string;
  refresh_token: string;
  phone: string;
  user_id: string;
  expires_at: number;         // Unix timestamp
  // Personnel fields — null if civilian
  role: 'medic' | 'responder' | 'admin' | null;
  full_name: string | null;
  city: string | null;
  badge_no: string | null;
  organization: string | null;
  // Unix ms of the last time the personnel table confirmed this role online.
  // null for civilians. See activeRole().
  personnel_verified_at?: number | null;
};

export type PersonnelFields = {
  role: 'medic' | 'responder' | 'admin';
  full_name: string;
  city: string | null;
  badge_no: string | null;
  organization: string | null;
};

// How long a responder keeps responder mode without reaching the server.
// Disaster zones can be offline for days; any successful online check
// re-confirms (or revokes) the role immediately.
export const PERSONNEL_OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

// The role the app should act on: the stored personnel role, as long as it
// was confirmed online within the grace period. Independent of access-token
// expiry, which only matters for network calls.
export function activeRole(session: CloudSession | null): CloudSession['role'] {
  if (!session?.role || !session.personnel_verified_at) return null;
  const age = Date.now() - session.personnel_verified_at;
  return age <= PERSONNEL_OFFLINE_GRACE_MS ? session.role : null;
}

// ================================================
// KEYS
// ================================================

const KEYS = {
  USER_PROFILE:      'lifetap:user_profile',
  PERSONNEL_SESSION: 'lifetap:personnel_session',
  APP_SETTINGS:      'lifetap:app_settings',
  CLOUD_SESSION:     'lifetap:cloud_session',
  // Old single-blob report layout — only read by the one-time migration.
  LEGACY_REPORTS:        '@lifetap_reports',
  LEGACY_ACTIVE_REPORT:  '@lifetap_active_report',
} as const;

// ================================================
// CLOUD SESSION
// ================================================

export async function getCloudSession(): Promise<CloudSession | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.CLOUD_SESSION);
    if (!raw) return null;

    const session: CloudSession = JSON.parse(raw);

    // An expired access token does NOT mean signed out — offline, Supabase can't
    // refresh it, and treating it as signed out dropped responders into civilian
    // mode in the field. The session is cleared only on SIGNED_OUT (AppContext).

    // Sessions saved before personnel_verified_at existed: start the grace
    // period now rather than demoting a responder who updated while offline.
    if (session.role && session.personnel_verified_at === undefined) {
      session.personnel_verified_at = Date.now();
      await EncryptedStorage.setItem(KEYS.CLOUD_SESSION, JSON.stringify(session));
    }

    return session;
  } catch (e) {
    console.error('getCloudSession error:', e);
    return null;
  }
}

// Called by AppContext.onAuthStateChange when Supabase refreshes tokens.
// Updates only the auth tokens and expiry without touching personnel data.
export async function updateCloudSessionTokens(
  access_token: string,
  refresh_token: string,
  expires_at_seconds: number,
): Promise<void> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.CLOUD_SESSION);
    if (!raw) return;
    const session: CloudSession = JSON.parse(raw);
    await EncryptedStorage.setItem(KEYS.CLOUD_SESSION, JSON.stringify({
      ...session,
      access_token,
      refresh_token,
      expires_at: expires_at_seconds * 1000,
    }));
  } catch (e) {
    console.error('updateCloudSessionTokens error:', e);
  }
}

// Called after an online personnel lookup. Pass null when the phone is not
// (or no longer) active personnel — this demotes the session to civilian.
export async function updateCloudSessionPersonnel(
  personnel: PersonnelFields | null
): Promise<void> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.CLOUD_SESSION);
    if (!raw) return;
    const session: CloudSession = JSON.parse(raw);
    await EncryptedStorage.setItem(KEYS.CLOUD_SESSION, JSON.stringify({
      ...session,
      role: personnel?.role ?? null,
      full_name: personnel?.full_name ?? null,
      city: personnel?.city ?? null,
      badge_no: personnel?.badge_no ?? null,
      organization: personnel?.organization ?? null,
      personnel_verified_at: personnel ? Date.now() : null,
    }));
  } catch (e) {
    console.error('updateCloudSessionPersonnel error:', e);
  }
}

export async function saveCloudSession(session: CloudSession): Promise<void> {
  try {
    await EncryptedStorage.setItem(KEYS.CLOUD_SESSION, JSON.stringify(session));
  } catch (e) {
    console.error('saveCloudSession error:', e);
  }
}

// iOS rejects removing a Keychain item that doesn't exist, and some keys are
// legitimately cleared twice (sign-out clears the session from the screen and
// from AppContext's SIGNED_OUT listener). Treat "already gone" as success and
// only report a failure if the value is actually still there.
async function removeSecureItem(key: string, label: string): Promise<void> {
  try {
    await EncryptedStorage.removeItem(key);
  } catch (e) {
    const still = await EncryptedStorage.getItem(key).catch(() => null);
    if (still) console.error(`${label} error:`, e);
  }
}

export async function clearCloudSession(): Promise<void> {
  await removeSecureItem(KEYS.CLOUD_SESSION, 'clearCloudSession');
}

// Convenience — check if logged in without fetching full session
export async function isLoggedIn(): Promise<boolean> {
  const session = await getCloudSession();
  return session !== null;
}

// Convenience — check if logged in user is personnel
export async function isPersonnel(): Promise<boolean> {
  const session = await getCloudSession();
  return activeRole(session) !== null;
}

// ================================================
// USER PROFILE
// ================================================

export async function getLocalUser(): Promise<LocalUser | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.USER_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('getLocalUser error:', e);
    return null;
  }
}

export async function saveLocalUser(user: LocalUser): Promise<void> {
  try {
    await EncryptedStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(user));
  } catch (e) {
    console.error('saveLocalUser error:', e);
  }
}

// Call this when user edits their profile
// Automatically marks tag and cloud as out of sync
export async function updateLocalUser(
  fields: Partial<Omit<LocalUser, 'lastModified' | 'syncedToTag' | 'syncedToCloud'>>
): Promise<LocalUser | null> {
  try {
    const existing = await getLocalUser();
    if (!existing) return null;

    const updated: LocalUser = {
      ...existing,
      ...fields,
      lastModified: Date.now(),
      syncedToTag: false,
      syncedToCloud: false,
    };

    await saveLocalUser(updated);
    return updated;
  } catch (e) {
    console.error('updateLocalUser error:', e);
    return null;
  }
}

// Call this after successfully writing to NFC tag
export async function markSyncedToTag(tagKeyId: number): Promise<void> {
  try {
    const existing = await getLocalUser();
    if (!existing) return;
    await saveLocalUser({
      ...existing,
      syncedToTag: true,
      tagFormat: TAG_FORMAT_VERSION,
      tagKeyId,
    });
  } catch (e) {
    console.error('markSyncedToTag error:', e);
  }
}

// Call this after successfully uploading to Supabase
export async function markSyncedToCloud(): Promise<void> {
  try {
    const existing = await getLocalUser();
    if (!existing) return;
    await saveLocalUser({ ...existing, syncedToCloud: true });
  } catch (e) {
    console.error('markSyncedToCloud error:', e);
  }
}

// Records a consent change that does NOT affect what's on the tag (e.g. the
// just-in-time cloud-backup consent recorded right before an upload), so it
// doesn't bump lastModified or mark the tag out of date. Choices that ARE on
// the tag (smsAlerts) must go through updateLocalUser instead.
export async function saveConsentOnly(consent: ConsentRecord): Promise<LocalUser | null> {
  try {
    const existing = await getLocalUser();
    if (!existing) return null;
    const updated = { ...existing, consent };
    await saveLocalUser(updated);
    return updated;
  } catch (e) {
    console.error('saveConsentOnly error:', e);
    return null;
  }
}

// Call this after pulling newer data from cloud.
// Callers must pass lastModified = new Date(updated_at).getTime() so that
// the next sync comparison sees local === cloud rather than local > cloud.
export async function overwriteLocalUserFromCloud(user: LocalUser): Promise<void> {
  try {
    await saveLocalUser({
      ...user,
      // Preserve caller-supplied lastModified (should be the cloud's updated_at).
      // Do NOT override with Date.now() — that causes a false "local is newer" on next sync.
      syncedToTag: false,
      syncedToCloud: true,
    });
  } catch (e) {
    console.error('overwriteLocalUserFromCloud error:', e);
  }
}

export async function clearLocalUser(): Promise<void> {
  await removeSecureItem(KEYS.USER_PROFILE, 'clearLocalUser');
}

// ================================================
// PERSONNEL SESSION
// ================================================

export async function getPersonnelSession(): Promise<PersonnelSession | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.PERSONNEL_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('getPersonnelSession error:', e);
    return null;
  }
}

export async function savePersonnelSession(session: PersonnelSession): Promise<void> {
  try {
    await EncryptedStorage.setItem(KEYS.PERSONNEL_SESSION, JSON.stringify(session));
  } catch (e) {
    console.error('savePersonnelSession error:', e);
  }
}

export async function clearPersonnelSession(): Promise<void> {
  await removeSecureItem(KEYS.PERSONNEL_SESSION, 'clearPersonnelSession');
}

// ================================================
// APP SETTINGS
// ================================================

const DEFAULT_SETTINGS: AppSettings = {
  appLockEnabled: false,
  lockMethod: 'faceid',
  onboardingComplete: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.APP_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch (e) {
    console.error('getAppSettings error:', e);
    return DEFAULT_SETTINGS;
  }
}

export async function updateAppSettings(
  fields: Partial<AppSettings>
): Promise<void> {
  try {
    const existing = await getAppSettings();
    await AsyncStorage.setItem(
      KEYS.APP_SETTINGS,
      JSON.stringify({ ...existing, ...fields })
    );
  } catch (e) {
    console.error('updateAppSettings error:', e);
  }
}

export async function getResponderUndertaking(
  userId: string
): Promise<{ version: string; acceptedAt: number } | null> {
  const settings = await getAppSettings();
  return settings.responderUndertakings?.[userId] ?? null;
}

export async function saveResponderUndertaking(userId: string, version: string): Promise<void> {
  const settings = await getAppSettings();
  await updateAppSettings({
    responderUndertakings: {
      ...settings.responderUndertakings,
      [userId]: { version, acceptedAt: Date.now() },
    },
  });
}

// ================================================
// SYNC STATUS DERIVED FROM LOCAL DATA
// Used by HomeScreen to determine which banner to show
// ================================================

export type SyncStatus = 'IN_SYNC' | 'TAG_BEHIND' | 'CLOUD_BEHIND' | 'NOT_SYNCED';

// Pure form, for callers that already hold the profile and session — every
// read here is a Keychain round trip, and HomeScreen needs both anyway.
// currentTagKeyId: the responder key this build seals new tags to
// (crypto/keys.currentResponderKeyId), or null if unknown.
// Whether the tag holds this profile in the current format. The syncedToTag
// flag alone isn't enough: a tag written before encryption, or sealed to a
// responder key that has since been rotated, still needs rewriting. Every
// screen that shows tag status must use this, not syncedToTag.
export function isTagCurrent(user: LocalUser, currentTagKeyId: number | null): boolean {
  const sealedTo = user.tagKeyId ?? 1;
  const keyCurrent = user.is_public || currentTagKeyId === null || sealedTo === currentTagKeyId;
  return user.syncedToTag && user.tagFormat === TAG_FORMAT_VERSION && keyCurrent;
}

export function syncStatusOf(
  user: LocalUser | null,
  loggedIn: boolean,
  currentTagKeyId: number | null
): SyncStatus {
  if (!user) return 'NOT_SYNCED';

  const tagCurrent = isTagCurrent(user, currentTagKeyId);

  if (!tagCurrent && (!user.syncedToCloud || !loggedIn)) return 'NOT_SYNCED';
  if (!tagCurrent) return 'TAG_BEHIND';
  if (!user.syncedToCloud && loggedIn) return 'CLOUD_BEHIND';
  return 'IN_SYNC';
}

export async function getSyncStatus(currentTagKeyId: number | null): Promise<SyncStatus> {
  const [user, loggedIn] = await Promise.all([getLocalUser(), isLoggedIn()]);
  return syncStatusOf(user, loggedIn, currentTagKeyId);
}

// ================================================
// RESPONDER REPORTS
// Every report on the device belongs to the responder who created it.
// Callers filter with isReportOwnedBy so a shared LGU phone never shows,
// activates, or uploads another account's reports.
// ================================================

export type ReportOwner = { userId: string; phone: string };

export function isReportOwnedBy(report: Report, owner: ReportOwner | null): boolean {
  if (!owner) return false;
  return report.ownerId
    ? report.ownerId === owner.userId
    : report.responderPhone === owner.phone;
}

// Storage layout: each report is its own encrypted item, so a scan reads and
// writes one small report instead of re-encrypting every report on the device
// (twice, with the old duplicated active copy). An index lists the ids, and the
// active report is stored as an id only — `isActive` is derived on read.
const REPORT_PREFIX = 'lifetap:report:';
const REPORT_INDEX = 'lifetap:reports_index';
const ACTIVE_REPORT_ID = 'lifetap:active_report_id';

// Report writes run one at a time, so two read-modify-write updates of the
// same report (a scan landing while a background upload finishes) can't
// overwrite each other.
let reportQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = reportQueue.then(fn, fn);
  reportQueue = run.catch(() => {});
  return run;
}

// One-time move from the old single-blob layout (@lifetap_reports +
// @lifetap_active_report). Safe to re-run if interrupted: the legacy keys are
// only removed after every report has been copied.
let migration: Promise<void> | null = null;
function reportsReady(): Promise<void> {
  if (!migration) {
    migration = migrateLegacyReports().catch((e) => {
      migration = null;
      console.error('report storage migration error:', e);
    });
  }
  return migration;
}

async function migrateLegacyReports(): Promise<void> {
  const legacy = await EncryptedStorage.getItem(KEYS.LEGACY_REPORTS);
  if (legacy == null) return;
  const list = JSON.parse(legacy) as Report[];
  const ids = await readIndex();
  for (const r of list) {
    await EncryptedStorage.setItem(REPORT_PREFIX + r.id, JSON.stringify(r));
    if (!ids.includes(r.id)) ids.push(r.id);
  }
  await writeIndex(ids);
  const legacyActive = await EncryptedStorage.getItem(KEYS.LEGACY_ACTIVE_REPORT);
  const activeId = legacyActive ? (JSON.parse(legacyActive) as Report).id : null;
  if (activeId) await EncryptedStorage.setItem(ACTIVE_REPORT_ID, activeId);
  await removeSecureItem(KEYS.LEGACY_ACTIVE_REPORT, 'report migration');
  await removeSecureItem(KEYS.LEGACY_REPORTS, 'report migration');
}

async function readIndex(): Promise<string[]> {
  const raw = await EncryptedStorage.getItem(REPORT_INDEX);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function writeIndex(ids: string[]): Promise<void> {
  await EncryptedStorage.setItem(REPORT_INDEX, JSON.stringify(ids));
}

async function readReport(id: string): Promise<Report | null> {
  const raw = await EncryptedStorage.getItem(REPORT_PREFIX + id);
  return raw ? (JSON.parse(raw) as Report) : null;
}

async function writeReport(report: Report): Promise<void> {
  // isActive is derived from ACTIVE_REPORT_ID on read, never stored.
  const stored: Omit<Report, 'isActive'> & { isActive?: boolean } = { ...report };
  delete stored.isActive;
  await EncryptedStorage.setItem(REPORT_PREFIX + report.id, JSON.stringify(stored));
}

async function getActiveReportId(): Promise<string | null> {
  return (await EncryptedStorage.getItem(ACTIVE_REPORT_ID)) ?? null;
}

function withActive(report: Report, activeId: string | null): Report {
  return { ...report, isActive: report.id === activeId };
}

export async function getAllReports(): Promise<Report[]> {
  try {
    await reportsReady();
    const [ids, activeId] = await Promise.all([readIndex(), getActiveReportId()]);
    const reports = await Promise.all(ids.map(readReport));
    return reports
      .filter((r): r is Report => r !== null)
      .map((r) => withActive(r, activeId));
  } catch (e) {
    console.error('getAllReports error:', e);
    return [];
  }
}

export async function getReportById(id: string): Promise<Report | null> {
  try {
    await reportsReady();
    const [report, activeId] = await Promise.all([readReport(id), getActiveReportId()]);
    return report ? withActive(report, activeId) : null;
  } catch (e) {
    console.error('getReportById error:', e);
    return null;
  }
}

async function saveReportUnlocked(report: Report): Promise<void> {
  await writeReport(report);
  const ids = await readIndex();
  if (!ids.includes(report.id)) await writeIndex([...ids, report.id]);
}

export async function saveReport(report: Report): Promise<void> {
  await reportsReady();
  await serialized(() => saveReportUnlocked(report));
}

export async function updateReport(report: Report): Promise<void> {
  await saveReport(report);
}

export async function deleteReport(id: string): Promise<void> {
  await reportsReady();
  await serialized(async () => {
    await removeSecureItem(REPORT_PREFIX + id, 'deleteReport');
    await writeIndex((await readIndex()).filter((x) => x !== id));
    if ((await getActiveReportId()) === id) await removeSecureItem(ACTIVE_REPORT_ID, 'deleteReport');
  });
}

export async function getActiveReport(): Promise<Report | null> {
  try {
    await reportsReady();
    const id = await getActiveReportId();
    const report = id ? await readReport(id) : null;
    return report ? withActive(report, id) : null;
  } catch (e) {
    console.error('getActiveReport error:', e);
    return null;
  }
}

export async function setActiveReport(report: Report | null): Promise<void> {
  try {
    await reportsReady();
    await serialized(async () => {
      if (report) {
        if (!(await readReport(report.id))) await saveReportUnlocked(report);
        await EncryptedStorage.setItem(ACTIVE_REPORT_ID, report.id);
      } else {
        await removeSecureItem(ACTIVE_REPORT_ID, 'setActiveReport');
      }
    });
  } catch (e) {
    console.error('setActiveReport error:', e);
  }
}

// Read-modify-write of one report under the queue. `change` returns the new
// report, or null to leave it untouched.
async function modifyReport(
  reportId: string,
  change: (r: Report) => Report | null
): Promise<Report | null> {
  await reportsReady();
  return serialized(async () => {
    const current = await readReport(reportId);
    if (!current) return null;
    const next = change(current);
    if (next) await writeReport(next);
    return withActive(next ?? current, await getActiveReportId());
  });
}

export async function addEntryToReport(
  reportId: string,
  entry: ReportEntry
): Promise<Report | null> {
  return modifyReport(reportId, (r) =>
    r.entries.some((e) => e.tagId === entry.tagId)
      ? null
      : { ...r, entries: [...r.entries, entry], syncedToCloud: false, updatedAt: Date.now() }
  );
}

// Patch one victim entry (e.g. smsSent) and mark the report for re-sync.
export async function updateReportEntry(
  reportId: string,
  entryId: string,
  patch: Partial<Omit<ReportEntry, 'id'>>
): Promise<Report | null> {
  return modifyReport(reportId, (r) => ({
    ...r,
    entries: r.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    syncedToCloud: false,
    updatedAt: Date.now(),
  }));
}

// uploadedUpdatedAt: the report's updatedAt when the upload started. If the
// report changed since (a victim was scanned during the upload), it stays
// unsynced so the change isn't silently left out of the cloud copy.
export async function markReportSynced(id: string, uploadedUpdatedAt?: number): Promise<void> {
  await modifyReport(id, (r) =>
    r.updatedAt === uploadedUpdatedAt ? { ...r, syncedToCloud: true } : null
  );
}