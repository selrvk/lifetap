import AsyncStorage from '@react-native-async-storage/async-storage';

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
// KEYS
// ================================================

const KEYS = {
  USER_PROFILE:      'lifetap:user_profile',
  PERSONNEL_SESSION: 'lifetap:personnel_session',
  APP_SETTINGS:      'lifetap:app_settings',
} as const;

// ================================================
// USER PROFILE
// ================================================

export async function getLocalUser(): Promise<LocalUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('getLocalUser error:', e);
    return null;
  }
}

export async function saveLocalUser(user: LocalUser): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(user));
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

// Call this after pulling newer data from cloud
export async function overwriteLocalUserFromCloud(user: LocalUser): Promise<void> {
  try {
    await saveLocalUser({
      ...user,
      lastModified: Date.now(),
      syncedToTag: false,    // cloud pulled but tag still needs update
      syncedToCloud: true,
    });
  } catch (e) {
    console.error('overwriteLocalUserFromCloud error:', e);
  }
}

export async function clearLocalUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.USER_PROFILE);
  } catch (e) {
    console.error('clearLocalUser error:', e);
  }
}

// ================================================
// PERSONNEL SESSION
// ================================================

export async function getPersonnelSession(): Promise<PersonnelSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PERSONNEL_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('getPersonnelSession error:', e);
    return null;
  }
}

export async function savePersonnelSession(session: PersonnelSession): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.PERSONNEL_SESSION, JSON.stringify(session));
  } catch (e) {
    console.error('savePersonnelSession error:', e);
  }
}

export async function clearPersonnelSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.PERSONNEL_SESSION);
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

  if (!user.syncedToTag && !user.syncedToCloud) return 'NOT_SYNCED';
  if (!user.syncedToTag) return 'TAG_BEHIND';
  if (!user.syncedToCloud) return 'CLOUD_BEHIND';
  return 'IN_SYNC';
}