import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import { createClient } from '@supabase/supabase-js';
import Config from 'react-native-config';
import 'react-native-url-polyfill/auto';

const supabaseUrl = Config.SUPABASE_URL!;
const supabaseAnonKey = Config.SUPABASE_ANON_KEY!;

// Supabase's session (including the long-lived refresh token) goes in the
// Keychain / EncryptedSharedPreferences instead of plain AsyncStorage.
// Sessions saved by older builds are moved over on first read, so nobody is
// logged out by the upgrade.
const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await EncryptedStorage.getItem(key);
      if (value != null) return value;

      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await EncryptedStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(key);
      }
      return legacy;
    } catch (e) {
      console.error('secureAuthStorage.getItem error:', e);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await EncryptedStorage.setItem(key, value);
    } catch (e) {
      console.error('secureAuthStorage.setItem error:', e);
    }
  },
  async removeItem(key: string): Promise<void> {
    // Also clear any copy left in AsyncStorage. iOS rejects removing a missing
    // Keychain item, which is fine here.
    await Promise.all([
      EncryptedStorage.removeItem(key).catch(() => {}),
      AsyncStorage.removeItem(key).catch(() => {}),
    ]);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// The key supabase-js stores the session under (its own default, derived the
// same way — we don't pass storageKey, and changing it would strand sessions
// saved by earlier builds).
const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

// supabase.auth.signOut() revokes the refresh token over the network. When that
// call fails — offline, which is exactly where LifeTap gets used — it returns
// the error and leaves its own stored session untouched, so the app would show
// "signed out" while the account stayed signed in underneath. On a shared
// responder phone the next person would inherit it. So whenever the request
// fails, drop the stored session here: the token stays valid on the server
// until it expires, but this phone has forgotten it.
export async function signOutSupabase(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return;
    console.warn('[auth] sign out request failed, clearing session locally:', error.message);
  } catch (e) {
    console.warn('[auth] sign out request threw, clearing session locally:', e);
  }
  await Promise.all([
    secureAuthStorage.removeItem(AUTH_STORAGE_KEY),
    secureAuthStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`),
    secureAuthStorage.removeItem(`${AUTH_STORAGE_KEY}-user`),
  ]);
}
