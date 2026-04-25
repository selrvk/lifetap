import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import type { Report, ReportEntry } from '../types/responder';

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
};

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
};

// ================================================
// KEYS
// ================================================

const KEYS = {
  USER_PROFILE:      'lifetap:user_profile',
  PERSONNEL_SESSION: 'lifetap:personnel_session',
  APP_SETTINGS:      'lifetap:app_settings',
  CLOUD_SESSION:     'lifetap:cloud_session',
  REPORTS:           '@lifetap_reports',
  ACTIVE_REPORT:     '@lifetap_active_report',
} as const;

// ================================================
// CLOUD SESSION
// ================================================

export async function getCloudSession(): Promise<CloudSession | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.CLOUD_SESSION);
    if (!raw) return null;

    const session: CloudSession = JSON.parse(raw);

    // Don't delete on expiry — Supabase may still be mid-refresh via onAuthStateChange.
    // The TOKEN_REFRESHED handler in AppContext will update the stored tokens.
    // Treat expired as "not logged in" but leave storage intact for the refresh to land.
    if (Date.now() > session.expires_at) return null;

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

export async function saveCloudSession(session: CloudSession): Promise<void> {
  try {
    await EncryptedStorage.setItem(KEYS.CLOUD_SESSION, JSON.stringify(session));
  } catch (e) {
    console.error('saveCloudSession error:', e);
  }
}

export async function clearCloudSession(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(KEYS.CLOUD_SESSION);
  } catch (e) {
    console.error('clearCloudSession error:', e);
  }
}

// Convenience — check if logged in without fetching full session
export async function isLoggedIn(): Promise<boolean> {
  const session = await getCloudSession();
  return session !== null;
}

// Convenience — check if logged in user is personnel
export async function isPersonnel(): Promise<boolean> {
  const session = await getCloudSession();
  return session !== null && session.role !== null;
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
export async function markSyncedToTag(): Promise<void> {
  try {
    const existing = await getLocalUser();
    if (!existing) return;
    await saveLocalUser({ ...existing, syncedToTag: true });
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
  try {
    await EncryptedStorage.removeItem(KEYS.USER_PROFILE);
  } catch (e) {
    console.error('clearLocalUser error:', e);
  }
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
  try {
    await EncryptedStorage.removeItem(KEYS.PERSONNEL_SESSION);
  } catch (e) {
    console.error('clearPersonnelSession error:', e);
  }
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

// ================================================
// SYNC STATUS DERIVED FROM LOCAL DATA
// Used by HomeScreen to determine which banner to show
// ================================================

export type SyncStatus = 'IN_SYNC' | 'TAG_BEHIND' | 'CLOUD_BEHIND' | 'NOT_SYNCED';

export async function getSyncStatus(): Promise<SyncStatus> {
  const user = await getLocalUser();
  if (!user) return 'NOT_SYNCED';

  const loggedIn = await isLoggedIn();

  if (!user.syncedToTag && (!user.syncedToCloud || !loggedIn)) return 'NOT_SYNCED';
  if (!user.syncedToTag) return 'TAG_BEHIND';
  if (!user.syncedToCloud && loggedIn) return 'CLOUD_BEHIND';
  return 'IN_SYNC';
}

// ================================================
// RESPONDER REPORTS
// ================================================

export async function getAllReports(): Promise<Report[]> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.REPORTS);
    return raw ? (JSON.parse(raw) as Report[]) : [];
  } catch (e) {
    console.error('getAllReports error:', e);
    return [];
  }
}

async function writeAllReports(reports: Report[]): Promise<void> {
  await EncryptedStorage.setItem(KEYS.REPORTS, JSON.stringify(reports));
}

export async function getReportById(id: string): Promise<Report | null> {
  const all = await getAllReports();
  return all.find((r) => r.id === id) ?? null;
}

export async function saveReport(report: Report): Promise<void> {
  const all = await getAllReports();
  const idx = all.findIndex((r) => r.id === report.id);
  if (idx >= 0) all[idx] = report;
  else all.push(report);
  await writeAllReports(all);
}

export async function updateReport(report: Report): Promise<void> {
  await saveReport(report);
}

export async function deleteReport(id: string): Promise<void> {
  const all = await getAllReports();
  await writeAllReports(all.filter((r) => r.id !== id));
  const active = await getActiveReport();
  if (active?.id === id) await setActiveReport(null);
}

export async function getActiveReport(): Promise<Report | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEYS.ACTIVE_REPORT);
    return raw ? (JSON.parse(raw) as Report) : null;
  } catch (e) {
    console.error('getActiveReport error:', e);
    return null;
  }
}

export async function setActiveReport(report: Report | null): Promise<void> {
  try {
    if (report) {
      const all = await getAllReports();
      const updated = all.map((r) => ({ ...r, isActive: r.id === report.id }));
      const exists = updated.some((r) => r.id === report.id);
      if (!exists) updated.push({ ...report, isActive: true });
      await writeAllReports(updated);
      await EncryptedStorage.setItem(
        KEYS.ACTIVE_REPORT,
        JSON.stringify({ ...report, isActive: true })
      );
    } else {
      const all = await getAllReports();
      const updated = all.map((r) => ({ ...r, isActive: false }));
      await writeAllReports(updated);
      await EncryptedStorage.removeItem(KEYS.ACTIVE_REPORT);
    }
  } catch (e) {
    console.error('setActiveReport error:', e);
  }
}

export async function addEntryToReport(
  reportId: string,
  entry: ReportEntry
): Promise<Report | null> {
  const all = await getAllReports();
  const idx = all.findIndex((r) => r.id === reportId);
  if (idx < 0) return null;

  const updated: Report = {
    ...all[idx],
    entries: [...all[idx].entries, entry],
    syncedToCloud: false,
  };
  all[idx] = updated;
  await writeAllReports(all);

  const active = await getActiveReport();
  if (active?.id === reportId) {
    await EncryptedStorage.setItem(KEYS.ACTIVE_REPORT, JSON.stringify(updated));
  }
  return updated;
}

export async function markReportSynced(id: string): Promise<void> {
  const report = await getReportById(id);
  if (!report) return;
  await saveReport({ ...report, syncedToCloud: true });
  const active = await getActiveReport();
  if (active?.id === id) {
    await EncryptedStorage.setItem(
      KEYS.ACTIVE_REPORT,
      JSON.stringify({ ...report, syncedToCloud: true })
    );
  }
}