import Config from 'react-native-config';
import EncryptedStorage from 'react-native-encrypted-storage';
import { hexToBytes } from '@noble/hashes/utils.js';
import { supabase } from '../lib/supabase';
import type { TagDecodeKeys, TagKeys } from './tagFormat';

// Tag keys (managed by scripts/tag-keys.mjs):
//   TAG_APP_SECRET            .env — every LifeTap build. Opens section A and
//                             derives per-tag NTAG passwords. Not a real secret
//                             against someone who unpacks the app; it keeps
//                             generic NFC apps out.
//   TAG_RESPONDER_PUBLIC_KEY  .env — every build, used to seal section B.
//   responder private keys    Supabase secret, handed out by the responder-keys
//                             Edge Function to active personnel only, cached
//                             here in encrypted storage.

const KEYRING = 'lifetap:responder_keys';

function hexKey(name: string): Uint8Array | null {
  const value = (Config as Record<string, string | undefined>)[name]?.trim();
  if (!value) return null;
  try {
    const bytes = hexToBytes(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function keyId(name: string): number {
  const n = Number((Config as Record<string, string | undefined>)[name] ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 255 ? n : 1;
}

export function getAppSecret(): Uint8Array | null {
  return hexKey('TAG_APP_SECRET');
}

// Keys for writing a tag; null if this build wasn't configured with them.
export function getWriteKeys(): TagKeys | null {
  const appSecret = getAppSecret();
  const responderPublicKey = hexKey('TAG_RESPONDER_PUBLIC_KEY');
  if (!appSecret || !responderPublicKey) return null;
  return {
    appSecret,
    appKeyId: keyId('TAG_APP_KEY_ID'),
    responderPublicKey,
    responderKeyId: keyId('TAG_RESPONDER_KEY_ID'),
  };
}

// The responder key id new tags are sealed to (null if not configured).
export function currentResponderKeyId(): number | null {
  return getWriteKeys()?.responderKeyId ?? null;
}

async function readKeyring(): Promise<Record<string, string>> {
  try {
    const raw = await EncryptedStorage.getItem(KEYRING);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getDecodeKeys(): Promise<TagDecodeKeys> {
  const appSecret = getAppSecret();
  const ring = await readKeyring();
  const responderSecrets: Record<number, Uint8Array> = {};
  for (const [kid, hex] of Object.entries(ring)) {
    try { responderSecrets[Number(kid)] = hexToBytes(hex); } catch {}
  }
  return {
    appSecrets: appSecret ? { [keyId('TAG_APP_KEY_ID')]: appSecret } : {},
    responderSecrets,
  };
}

export async function hasResponderKeys(): Promise<boolean> {
  return Object.keys(await readKeyring()).length > 0;
}

// Downloads the responder private keys. The server only answers active
// personnel. Returns false offline or when refused (keeps any cached keys on
// network failure; the caller clears them on a confirmed "not personnel").
export async function refreshResponderKeys(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('responder-keys', { method: 'POST' });
    if (error || !data?.keys || typeof data.keys !== 'object') return false;
    await EncryptedStorage.setItem(KEYRING, JSON.stringify(data.keys));
    return true;
  } catch {
    return false;
  }
}

export async function ensureResponderKeys(): Promise<void> {
  if (!(await hasResponderKeys())) await refreshResponderKeys();
}

export async function clearResponderKeys(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(KEYRING);
  } catch {
    // iOS rejects removing a missing item — nothing to clear.
  }
}
