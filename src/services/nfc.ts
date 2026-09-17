import { Platform } from 'react-native';
import NfcManager, { NfcTech, Ndef, NfcError } from 'react-native-nfc-manager';
import { hexToBytes } from '@noble/hashes/utils.js';
import type { Kin, LocalUser } from '../storage/asyncStorage';
import {
  decodeTagPayload,
  encodeTagPayload,
  ntagPassword,
  TAG_MIME_TYPE,
  TagKeys,
} from '../crypto/tagFormat';
import * as ntag from '../crypto/ntag';
import {
  getAppSecret,
  getDecodeKeys,
  getWriteKeys,
  hasResponderKeys,
  refreshResponderKeys,
} from '../crypto/keys';

// What a LifeTap tag holds: the profile minus device-only sync flags and the
// consent record, plus the one consent choice responders need to see.
export type TagProfile = Omit<
  LocalUser,
  'lastModified' | 'syncedToTag' | 'syncedToCloud' | 'consent' | 'tagFormat'
> & {
  lastModified?: number;
  // false = the person did not allow SMS alerts to their emergency contacts.
  // Tags written before the consent flow have no flag and are treated as true.
  sms: boolean;
  // Set when the responder-only section couldn't be opened on this device
  // ('no_key': no responder key downloaded; 'invalid': failed verification).
  // The medical/contact fields are then EMPTY, not "none" — screens must not
  // present them as "no known allergies".
  restricted?: 'no_key' | 'invalid';
};

// Thrown by readNfcTag/writeNfcTag when the user (or our cancel button)
// ended the NFC session — callers should close quietly, not show an error.
export const NFC_CANCELLED = 'NFC_CANCELLED';
export const UNRECOGNIZED_TAG = 'UNRECOGNIZED_TAG';

// Plain-text record for phones without LifeTap (shows up in any NFC reader).
const TAG_HINT_TEXT = 'LifeTap medical ID. Scan with the LifeTap app, or call 911.';
const ANDROID_PACKAGE = 'com.lifetap';
// A single empty NDEF record — the standard "blank tag" content.
const EMPTY_MESSAGE = [0xd0, 0x00, 0x00];

function isUserCancel(e: unknown): boolean {
  return e instanceof NfcError.UserCancel;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

// Tags come from the physical world — anything could be on them. Accept only
// objects that look like a LifeTap profile, and fill every field so screens
// never see undefined. Returns null if it isn't a LifeTap tag.
export function parseTagPayload(raw: unknown): TagProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id).trim();
  const n = str(o.n).trim();
  if (!id || !n) return null;

  const kin: Kin[] = Array.isArray(o.kin)
    ? o.kin
        .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
        .map((k) => ({ n: str(k.n), p: str(k.p), r: str(k.r) }))
        .filter((k) => k.n || k.p)
    : [];

  return {
    id,
    n,
    dob: str(o.dob),
    bt: str(o.bt),
    brg: str(o.brg),
    cty: str(o.cty),
    phn: str(o.phn),
    rel: str(o.rel),
    od: o.od === true,
    is_public: o.is_public === true,
    sms: o.sms !== false,
    a: strList(o.a),
    c: strList(o.c),
    meds: strList(o.meds),
    kin,
    lastModified: typeof o.lastModified === 'number' ? o.lastModified : undefined,
  };
}

// Call once at app startup in App.tsx
export async function initNfc(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    if (supported) await NfcManager.start();
    return supported;
  } catch {
    return false;
  }
}

type NdefRecordLike = { tnf: number; type: any; payload: any };

// Encrypted (v2) record → profile. Throws if it can't be opened at all.
// refreshIfMissingKey: a responder device (it already holds a keyring) that
// meets a tag sealed to a key it doesn't have — e.g. right after a rotation —
// fetches the current keys once and retries. Civilians never call the server.
async function profileFromLifetapRecord(
  record: NdefRecordLike,
  opts: { refreshIfMissingKey?: boolean } = {}
): Promise<TagProfile> {
  const bytes = Uint8Array.from(record.payload as number[]);
  let decoded = decodeTagPayload(bytes, await getDecodeKeys());
  if (
    decoded.restricted === 'no_key' &&
    opts.refreshIfMissingKey &&
    (await hasResponderKeys()) &&
    (await refreshResponderKeys())
  ) {
    decoded = decodeTagPayload(bytes, await getDecodeKeys());
  }
  const profile = parseTagPayload(decoded.fields);
  if (!profile) throw new Error(UNRECOGNIZED_TAG);
  return decoded.restricted ? { ...profile, restricted: decoded.restricted } : profile;
}

// Tags written before encryption: one text record with the profile as JSON.
function profileFromLegacyRecord(record: NdefRecordLike): TagProfile | null {
  try {
    const text = Ndef.text.decodePayload(record.payload as unknown as Uint8Array);
    return parseTagPayload(JSON.parse(text));
  } catch {
    return null;
  }
}

function findLifetapRecord(records: NdefRecordLike[]): NdefRecordLike | undefined {
  return records.find((r) => Ndef.isType(r as any, Ndef.TNF_MIME_MEDIA, TAG_MIME_TYPE));
}

// read — returns the profile, or null if the read failed.
// Throws UNRECOGNIZED_TAG for non-LifeTap tags and NFC_CANCELLED on cancel.
export async function readNfcTag(): Promise<TagProfile | null> {
  // Read the records, then close the NFC session before decrypting — so the
  // system sheet dismisses quickly and a key refresh never holds it open.
  let records: NdefRecordLike[];
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Hold your phone near the LifeTap tag',
    });
    const tag = await NfcManager.getTag();
    records = (tag?.ndefMessage ?? []) as NdefRecordLike[];
  } catch (e) {
    if (isUserCancel(e)) throw new Error(NFC_CANCELLED);
    console.error('readNfcTag error:', e);
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }

  if (!records.length) throw new Error(UNRECOGNIZED_TAG);
  const lifetap = findLifetapRecord(records);
  if (lifetap) {
    try {
      return await profileFromLifetapRecord(lifetap, { refreshIfMissingKey: true });
    } catch {
      throw new Error(UNRECOGNIZED_TAG);
    }
  }
  const legacy = profileFromLegacyRecord(records[0]);
  if (!legacy) throw new Error(UNRECOGNIZED_TAG);
  return legacy;
}

// ── Writing ──────────────────────────────────────────────────────────────────

export type TagWriteResult =
  // responderKeyId: key the medical section was sealed to (0 = public profile,
  // nothing sealed); undefined for erase.
  | { ok: true; responderKeyId?: number }
  | { ok: false; reason: 'not_configured' | 'unsupported' | 'not_ndef' | 'read_only' | 'locked' | 'failed' }
  | { ok: false; reason: 'too_large'; needed: number; capacity: number }
  // The tag already holds someone else's LifeTap profile, or other data.
  // Re-run with { force: true } after the user confirms.
  | { ok: false; reason: 'foreign'; kind: 'lifetap' | 'other' };

function buildMessage(profile: TagProfile, keys: TagKeys): number[] {
  const payload = encodeTagPayload(profile, keys);
  return Ndef.encodeMessage([
    Ndef.record(Ndef.TNF_MIME_MEDIA, TAG_MIME_TYPE, [], Array.from(payload)),
    Ndef.textRecord(TAG_HINT_TEXT),
    Ndef.androidApplicationRecord(ANDROID_PACKAGE),
  ]);
}

// Bytes the profile will take on a tag (for the size meter on the confirm
// step). NTAG216 holds 872; returns null if encryption isn't configured.
export function tagBytesNeeded(profile: TagProfile): number | null {
  const keys = getWriteKeys();
  return keys ? ntag.ndefTlvSize(buildMessage(profile, keys).length) : null;
}

export const NTAG216_CAPACITY = 872;

type Existing = { kind: 'empty' } | { kind: 'lifetap'; id: string } | { kind: 'other' };

async function classifyExisting(message: number[] | null): Promise<Existing> {
  if (!message) return { kind: 'empty' };
  let records: NdefRecordLike[];
  try {
    records = Ndef.decodeMessage(message) as NdefRecordLike[];
  } catch {
    return { kind: 'other' };
  }
  if (records.every((r) => r.tnf === Ndef.TNF_EMPTY)) return { kind: 'empty' };
  const lifetap = findLifetapRecord(records);
  if (lifetap) {
    try {
      return { kind: 'lifetap', id: (await profileFromLifetapRecord(lifetap)).id };
    } catch {
      return { kind: 'other' };
    }
  }
  const legacy = profileFromLegacyRecord(records[0]);
  return legacy ? { kind: 'lifetap', id: legacy.id } : { kind: 'other' };
}

// One raw NFC-A / MIFARE session: the NTAG password unlock only lasts for the
// session, so auth and all writes happen inside it.
async function withNtagSession<T>(fn: (t: ntag.Transceive, uid: Uint8Array) => Promise<T>): Promise<T> {
  const ios = Platform.OS === 'ios';
  try {
    await NfcManager.requestTechnology(ios ? NfcTech.MifareIOS : NfcTech.NfcA, {
      alertMessage: 'Hold your LifeTap tag near the top of your phone',
    });
    const tag = await NfcManager.getTag();
    if (!tag?.id) throw new ntag.NtagError('unsupported', 'no tag UID');
    const transceive: ntag.Transceive = ios
      ? (bytes) => NfcManager.sendMifareCommandIOS(bytes)
      : (bytes) => NfcManager.nfcAHandler.transceive(bytes);
    return await fn(transceive, hexToBytes(String(tag.id)));
  } catch (e) {
    if (isUserCancel(e)) throw new Error(NFC_CANCELLED);
    throw e;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

async function writeMessage(
  message: number[],
  opts: { ownId?: string; force?: boolean; protect: boolean }
): Promise<TagWriteResult> {
  const appSecret = getAppSecret();
  if (!appSecret) return { ok: false, reason: 'not_configured' };

  try {
    return await withNtagSession(async (t, uid): Promise<TagWriteResult> => {
      const info = await ntag.identify(t);
      const needed = ntag.ndefTlvSize(message.length);
      if (needed > info.capacity) {
        return { ok: false, reason: 'too_large', needed, capacity: info.capacity };
      }

      const { pwd, pack } = ntagPassword(appSecret, uid);
      const wasProtected = ntag.isProtected(info);
      if (wasProtected && !(await ntag.authenticate(t, pwd, pack))) {
        return { ok: false, reason: 'locked' };
      }

      if (!opts.force) {
        const existing = await classifyExisting(await ntag.readNdefMessage(t, info));
        if (existing.kind === 'other') return { ok: false, reason: 'foreign', kind: 'other' };
        if (existing.kind === 'lifetap' && existing.id !== opts.ownId) {
          return { ok: false, reason: 'foreign', kind: 'lifetap' };
        }
      }

      await ntag.writeNdefMessage(t, info, message);
      if (opts.protect && !wasProtected) await ntag.enableProtection(t, info, pwd, pack);
      if (!opts.protect && wasProtected) await ntag.disableProtection(t, info);
      return { ok: true };
    });
  } catch (e: any) {
    if (e instanceof Error && e.message === NFC_CANCELLED) throw e;
    if (e instanceof ntag.NtagError && e.reason !== 'io') return { ok: false, reason: e.reason };
    console.error('tag write error:', e?.name, e?.message);
    return { ok: false, reason: 'failed' };
  }
}

// Encrypts the profile and writes it, then write-protects the tag with its
// per-tag password (first write) — only LifeTap can change it afterwards.
export async function writeNfcTag(
  profile: TagProfile,
  opts: { force?: boolean } = {}
): Promise<TagWriteResult> {
  const keys = getWriteKeys();
  if (!keys) return { ok: false, reason: 'not_configured' };
  const result = await writeMessage(buildMessage(profile, keys), {
    ownId: profile.id,
    force: opts.force,
    protect: true,
  });
  return result.ok
    ? { ok: true, responderKeyId: profile.is_public ? 0 : keys.responderKeyId }
    : result;
}

// Wipes the tag to a single empty record and removes LifeTap's write
// protection, handing the tag back to its owner (used when withdrawing consent).
export async function eraseNfcTag(
  opts: { ownId?: string; force?: boolean } = {}
): Promise<TagWriteResult> {
  return writeMessage(EMPTY_MESSAGE, { ownId: opts.ownId, force: opts.force, protect: false });
}

// cancel
export async function cancelNfc(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}
