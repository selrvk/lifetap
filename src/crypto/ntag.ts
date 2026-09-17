// Low-level NTAG213/215/216 (NFC Forum Type 2) operations over raw commands.
//
// Why raw commands instead of the Ndef helpers: LifeTap tags are write-
// protected with the chip's 32-bit password (PWD_AUTH). The password unlock
// only lasts for the current radio session, so the auth and every write must
// go over the same NfcA / MIFARE connection. Pure logic (no React Native) so it
// can be tested against a simulated chip — the caller supplies `transceive`.
//
// Protection model: write-protected from page 4 (user memory + config),
// reading stays open (responders and civilians must be able to read offline;
// confidentiality comes from the payload encryption). AUTHLIM = 0 (unlimited
// attempts) on purpose: a limit would let anyone permanently brick a tag's
// writes by trying wrong passwords.

export type Transceive = (bytes: number[]) => Promise<number[]>;

export class NtagError extends Error {
  constructor(
    public reason: 'unsupported' | 'not_ndef' | 'read_only' | 'locked' | 'io',
    message?: string
  ) {
    super(message ?? reason);
  }
}

type Model = { name: string; cfg0: number; userEnd: number };
const MODELS: Record<number, Model> = {
  0x0f: { name: 'NTAG213', cfg0: 0x29, userEnd: 0x27 },
  0x11: { name: 'NTAG215', cfg0: 0x83, userEnd: 0x81 },
  0x13: { name: 'NTAG216', cfg0: 0xe3, userEnd: 0xe1 },
};

const CMD_GET_VERSION = 0x60;
const CMD_READ = 0x30;
const CMD_WRITE = 0xa2;
const CMD_PWD_AUTH = 0x1b;
const FIRST_USER_PAGE = 4;
const ACK = 0x0a;

export type NtagInfo = {
  model: Model;
  capacity: number;        // NDEF data area in bytes, from the Capability Container
  protectedFrom: number;   // AUTH0: first protected page (0xFF = unprotected)
  access: number;          // ACCESS byte
  cfg0: number[];
  cfg1: number[];
};

async function read16(t: Transceive, page: number): Promise<number[]> {
  const r = await t([CMD_READ, page]);
  if (!r || r.length < 16) throw new NtagError('io', `READ ${page} returned ${r?.length ?? 0} bytes`);
  return r.slice(0, 16);
}

async function write4(t: Transceive, page: number, bytes: number[]): Promise<void> {
  const r = await t([CMD_WRITE, page, ...bytes.slice(0, 4)]);
  // Android returns the 4-bit ACK as [0x0A]; iOS may return nothing. Any other
  // single byte is a NAK (0x0 bad arg, 0x1 CRC, 0x4 auth limit, 0x5 EEPROM).
  if (r && r.length === 1 && r[0] !== ACK) {
    throw new NtagError('io', `WRITE ${page} NAK 0x${r[0].toString(16)}`);
  }
}

export async function identify(t: Transceive): Promise<NtagInfo> {
  let version: number[];
  try {
    version = await t([CMD_GET_VERSION]);
  } catch {
    throw new NtagError('unsupported', 'GET_VERSION failed');
  }
  // [0x00, vendor 0x04 NXP, type 0x04 NTAG, ..., storage size, 0x03]
  const model = version?.length >= 8 && version[1] === 0x04 && version[2] === 0x04
    ? MODELS[version[6]]
    : undefined;
  if (!model) throw new NtagError('unsupported', 'not an NTAG213/215/216');

  const cc = (await read16(t, 3)).slice(0, 4);
  if (cc[0] !== 0xe1) throw new NtagError('not_ndef', 'no NDEF capability container');
  // CC byte 3: high nibble = read access, low nibble = write access (0x0F = none).
  if ((cc[3] & 0x0f) !== 0) throw new NtagError('read_only', 'tag is permanently read-only');

  const cfg = await read16(t, model.cfg0);
  return {
    model,
    capacity: cc[2] * 8,
    protectedFrom: cfg[3],
    access: cfg[4],
    cfg0: cfg.slice(0, 4),
    cfg1: cfg.slice(4, 8),
  };
}

// True if the password guards any page (user memory or config). Either way we
// must authenticate before writing — config pages hold the password itself.
export function isProtected(info: NtagInfo): boolean {
  return info.protectedFrom <= info.model.cfg0 + 3;
}

// PWD_AUTH. Returns false if the tag rejects the password or answers with an
// unexpected PACK (not a LifeTap tag, or a different app locked it).
export async function authenticate(t: Transceive, pwd: number[], pack: number[]): Promise<boolean> {
  try {
    const r = await t([CMD_PWD_AUTH, ...pwd]);
    return !!r && r.length >= 2 && r[0] === pack[0] && r[1] === pack[1];
  } catch {
    return false;
  }
}

// Reads the NDEF message bytes (inside the NDEF TLV), or null if empty.
export async function readNdefMessage(t: Transceive, info: NtagInfo): Promise<number[] | null> {
  const area: number[] = [];
  const need = async (n: number) => {
    while (area.length < n && area.length < info.capacity) {
      area.push(...(await read16(t, FIRST_USER_PAGE + area.length / 4)));
    }
  };
  let pos = 0;
  while (pos < info.capacity) {
    await need(pos + 4);
    const type = area[pos];
    if (type === 0x00) { pos += 1; continue; }        // NULL TLV
    if (type === 0xfe || type === undefined) return null; // Terminator
    let len = area[pos + 1];
    let hdr = 2;
    if (len === 0xff) { len = (area[pos + 2] << 8) | area[pos + 3]; hdr = 4; }
    if (type === 0x03) {
      if (len === 0) return null;
      await need(pos + hdr + len);
      return area.slice(pos + hdr, pos + hdr + len);
    }
    pos += hdr + len;                                 // Lock/Memory control TLVs
  }
  return null;
}

export function ndefTlvSize(messageLength: number): number {
  return (messageLength < 0xff ? 2 : 4) + messageLength + 1;
}

// Writes an NDEF message, tearing-safe: page 4 is first set to an empty NDEF
// TLV and only rewritten with the real header after every other page is
// written, so a tag pulled away mid-write reads as empty instead of corrupt.
export async function writeNdefMessage(t: Transceive, info: NtagInfo, message: number[]): Promise<void> {
  const header = message.length < 0xff
    ? [0x03, message.length]
    : [0x03, 0xff, message.length >> 8, message.length & 0xff];
  const data = [...header, ...message, 0xfe];
  while (data.length % 4) data.push(0x00);
  if (data.length > info.capacity) throw new NtagError('io', 'message does not fit');

  await write4(t, FIRST_USER_PAGE, [0x03, 0x00, 0xfe, 0x00]);
  for (let i = 4; i < data.length; i += 4) {
    await write4(t, FIRST_USER_PAGE + i / 4, data.slice(i, i + 4));
  }
  await write4(t, FIRST_USER_PAGE, data.slice(0, 4));
}

// Turns on write protection from page 4 with the given password. Must run
// while the tag is unprotected or already authenticated.
export async function enableProtection(t: Transceive, info: NtagInfo, pwd: number[], pack: number[]) {
  const cfgLocked = (info.access & 0x40) !== 0;
  if (cfgLocked) return; // CFGLCK set by someone else — leave the tag as is
  const pwdPage = info.model.cfg0 + 2;
  await write4(t, pwdPage, pwd);
  await write4(t, pwdPage + 1, [pack[0], pack[1], 0x00, 0x00]);
  // ACCESS: PROT = 0 (protect writes only), AUTHLIM = 0; keep the other bits.
  await write4(t, info.model.cfg0 + 1, [info.access & ~0x87, ...info.cfg1.slice(1)]);
  // AUTH0 last — from this write on, page ≥ 4 needs the password.
  await write4(t, info.model.cfg0, [...info.cfg0.slice(0, 3), FIRST_USER_PAGE]);
}

// Removes write protection (AUTH0 = 0xFF). Requires prior authentication.
export async function disableProtection(t: Transceive, info: NtagInfo) {
  if ((info.access & 0x40) !== 0) return;
  await write4(t, info.model.cfg0, [...info.cfg0.slice(0, 3), 0xff]);
}
