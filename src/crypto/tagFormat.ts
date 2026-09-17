// LifeTap tag payload, format v2 — encrypted, two sections.
//
//   Section A — readable by any LifeTap app (key derived from the app secret).
//     Private profile: { id, n, bt, sms }            → what civilians see
//     Public profile:  the whole profile              → is_public = true
//   Section B — readable only by responders (sealed to the responder public
//     key; the private key is downloaded only by active personnel).
//     Everything else: dob, address, phone, religion, organ donor, medical, kin.
//
// Byte layout (stored as one NDEF MIME record, application/vnd.lifetap):
//   [0]    version (2)
//   [1]    flags   bit0 = public profile, bit1 = section B present
//   [2]    app key id
//   [3]    responder key id (0 when there is no section B)
//   [4..5] length of section A (uint16, big-endian)
//   A:     nonce(12) ‖ AES-256-GCM(deflate(json))       — AAD = header
//   B:     ephemeralPub(32) ‖ nonce(12) ‖ AES-256-GCM(deflate(json))
//          key = HKDF(X25519(eph, responderPub))        — AAD = header ‖ ephemeralPub
//
// Deliberately free of React Native imports so it can be unit-tested in Node.
// Random bytes come from crypto.getRandomValues (react-native-get-random-values
// installs it in the app; Node has it built in).

import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { deflateSync, inflateSync, strFromU8 } from 'fflate';

export const TAG_FORMAT_VERSION = 2;
export const TAG_MIME_TYPE = 'application/vnd.lifetap';

const FLAG_PUBLIC = 0b01;
const FLAG_HAS_B = 0b10;
const HEADER_LEN = 6;
const NONCE_LEN = 12;

export type TagKeys = {
  appSecret: Uint8Array;            // 32 bytes, ships with the app
  appKeyId: number;
  responderPublicKey: Uint8Array;   // 32 bytes, ships with the app
  responderKeyId: number;
};

export type TagDecodeKeys = {
  appSecrets: Record<number, Uint8Array>;
  responderSecrets: Record<number, Uint8Array>; // empty for civilians
};

// The fields a tag carries (TagProfile without the `restricted` marker).
export type TagFields = {
  id: string; n: string; bt: string; sms: boolean; is_public: boolean;
  dob: string; brg: string; cty: string; phn: string; rel: string; od: boolean;
  a: string[]; c: string[]; meds: string[];
  kin: { n: string; p: string; r: string }[];
  lastModified?: number;
};

export type DecodedTag = {
  fields: Record<string, unknown>;   // raw JSON, normalized by the caller
  // Section B exists but couldn't be opened: no responder key on this device
  // ('no_key'), or it failed authentication ('invalid').
  restricted: false | 'no_key' | 'invalid';
};

export class TagFormatError extends Error {}

// Domain-separation labels: one app secret, independent keys per purpose.
const INFO_A = utf8ToBytes('lifetap tag A v2');
const INFO_B = utf8ToBytes('lifetap tag B v2');
const INFO_PWD = utf8ToBytes('lifetap ntag pwd v1');

function appKeyA(appSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, appSecret, undefined, INFO_A, 32);
}

function keyB(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concatBytes(ephPub, recipientPub), INFO_B, 32);
}

// Per-tag NTAG password: diversified by the tag's UID so learning one tag's
// password (it travels in the clear over NFC) doesn't unlock any other tag.
export function ntagPassword(appSecret: Uint8Array, uid: Uint8Array): { pwd: number[]; pack: number[] } {
  const k = hkdf(sha256, appSecret, undefined, INFO_PWD, 32);
  const mac = hmac(sha256, k, uid);
  return { pwd: Array.from(mac.slice(0, 4)), pack: Array.from(mac.slice(4, 6)) };
}

function pack(obj: unknown): Uint8Array {
  return deflateSync(utf8ToBytes(JSON.stringify(obj)), { level: 9 });
}

function unpack(bytes: Uint8Array): Record<string, unknown> {
  const parsed = JSON.parse(strFromU8(inflateSync(bytes)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TagFormatError('section is not an object');
  }
  return parsed as Record<string, unknown>;
}

export function encodeTagPayload(p: TagFields, keys: TagKeys): Uint8Array {
  const isPublic = p.is_public === true;
  const b = {
    dob: p.dob, brg: p.brg, cty: p.cty, phn: p.phn, rel: p.rel, od: p.od,
    a: p.a, c: p.c, meds: p.meds, kin: p.kin, lm: p.lastModified,
  };
  const a = isPublic
    ? { id: p.id, n: p.n, bt: p.bt, sms: p.sms, pub: 1, ...b }
    : { id: p.id, n: p.n, bt: p.bt, sms: p.sms };

  const packedA = pack(a);
  const lenA = NONCE_LEN + packedA.length + 16;
  if (lenA > 0xffff) throw new TagFormatError('section A too large');

  const header = new Uint8Array([
    TAG_FORMAT_VERSION,
    (isPublic ? FLAG_PUBLIC : 0) | (isPublic ? 0 : FLAG_HAS_B),
    keys.appKeyId,
    isPublic ? 0 : keys.responderKeyId,
    lenA >> 8,
    lenA & 0xff,
  ]);

  const nonceA = randomBytes(NONCE_LEN);
  const sectionA = concatBytes(nonceA, gcm(appKeyA(keys.appSecret), nonceA, header).encrypt(packedA));
  if (isPublic) return concatBytes(header, sectionA);

  const ephSecret = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(ephSecret);
  const shared = x25519.getSharedSecret(ephSecret, keys.responderPublicKey);
  const nonceB = randomBytes(NONCE_LEN);
  const ctB = gcm(keyB(shared, ephPub, keys.responderPublicKey), nonceB, concatBytes(header, ephPub))
    .encrypt(pack(b));
  return concatBytes(header, sectionA, ephPub, nonceB, ctB);
}

export function decodeTagPayload(bytes: Uint8Array, keys: TagDecodeKeys): DecodedTag {
  if (bytes.length < HEADER_LEN || bytes[0] !== TAG_FORMAT_VERSION) {
    throw new TagFormatError('unsupported tag format');
  }
  const header = bytes.slice(0, HEADER_LEN);
  const flags = header[1];
  const appSecret = keys.appSecrets[header[2]];
  if (!appSecret) throw new TagFormatError('unknown app key');

  const lenA = (header[4] << 8) | header[5];
  const sectionA = bytes.slice(HEADER_LEN, HEADER_LEN + lenA);
  if (sectionA.length !== lenA || lenA < NONCE_LEN + 16) throw new TagFormatError('truncated');

  let fieldsA: Record<string, unknown>;
  try {
    const plainA = gcm(appKeyA(appSecret), sectionA.slice(0, NONCE_LEN), header)
      .decrypt(sectionA.slice(NONCE_LEN));
    fieldsA = unpack(plainA);
  } catch {
    throw new TagFormatError('section A failed authentication');
  }

  const isPublic = (flags & FLAG_PUBLIC) !== 0;
  const fields: Record<string, unknown> = { ...fieldsA, is_public: isPublic };
  if (!(flags & FLAG_HAS_B)) return { fields: renameLm(fields), restricted: false };

  const secret = keys.responderSecrets[header[3]];
  if (!secret) return { fields: renameLm(fields), restricted: 'no_key' };

  try {
    const rest = bytes.slice(HEADER_LEN + lenA);
    const ephPub = rest.slice(0, 32);
    const nonceB = rest.slice(32, 32 + NONCE_LEN);
    const shared = x25519.getSharedSecret(secret, ephPub);
    const plainB = gcm(
      keyB(shared, ephPub, x25519.getPublicKey(secret)),
      nonceB,
      concatBytes(header, ephPub)
    ).decrypt(rest.slice(32 + NONCE_LEN));
    return { fields: renameLm({ ...unpack(plainB), ...fieldsA, is_public: isPublic }), restricted: false };
  } catch {
    return { fields: renameLm(fields), restricted: 'invalid' };
  }
}

function renameLm(fields: Record<string, unknown>): Record<string, unknown> {
  const { lm, ...rest } = fields;
  return lm === undefined ? rest : { ...rest, lastModified: lm };
}
