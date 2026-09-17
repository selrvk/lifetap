#!/usr/bin/env node
// Tests for LifeTap tag encryption, key rotation and NTAG write protection.
//
//   npm run test:tags
//
// Compiles src/crypto/tagFormat.ts and src/crypto/ntag.ts with the project's
// TypeScript, then runs them in Node. The NTAG tests use a software model of an
// NTAG216 chip (memory map, capability container, PWD_AUTH write protection,
// NAK on protected writes, tag removal mid-write), so they run without a phone.
// Exits non-zero if any check fails.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}node_modules/.cache/lifetap-tag-tests`;
const require = createRequire(import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/package.json`, '{"type":"module"}');
const tsc = spawnSync(
  `${root}node_modules/.bin/tsc`,
  ['src/crypto/tagFormat.ts', 'src/crypto/ntag.ts', '--outDir', out, '--module', 'esnext',
    '--moduleResolution', 'bundler', '--target', 'es2022', '--skipLibCheck', '--declaration', 'false'],
  { cwd: root, stdio: 'inherit' }
);
if (tsc.status !== 0) process.exit(1);

const F = await import(pathToFileURL(`${out}/tagFormat.js`).href);
const N = await import(pathToFileURL(`${out}/ntag.js`).href);
const { x25519 } = await import('@noble/curves/ed25519.js');
const { randomBytes } = await import('@noble/hashes/utils.js');
const Ndef = require('react-native-nfc-manager/ndef-lib/index.js');

let passed = 0;
let failed = 0;
function check(condition, name) {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? '  ✓' : '  ✗ FAIL'} ${name}`);
}
async function throws(fn) {
  try { await fn(); return false; } catch { return true; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Fixtures ────────────────────────────────────────────────────────────────

const appSecret = randomBytes(32);
const resp1 = x25519.utils.randomSecretKey();
const resp2 = x25519.utils.randomSecretKey();
const keysWith = (secret, id) => ({
  appSecret, appKeyId: 1, responderPublicKey: x25519.getPublicKey(secret), responderKeyId: id,
});
const civilian = { appSecrets: { 1: appSecret }, responderSecrets: {} };
const responder = (ring) => ({ appSecrets: { 1: appSecret }, responderSecrets: ring });

const typical = {
  id: 'lt-mbx4k2p1-a9f3', n: 'Juan Miguel Dela Cruz', dob: '1988-04-12', bt: 'O+',
  brg: 'Barangay Poblacion', cty: 'Batangas City, Batangas', phn: '09171234567', rel: 'Roman Catholic',
  od: true, a: ['Penicillin', 'Shellfish'], c: ['Hypertension', 'Type 2 Diabetes'],
  meds: ['Metformin 500mg', 'Losartan 50mg'],
  kin: [{ n: 'Maria Dela Cruz', p: '09181234567', r: 'Wife' }, { n: 'Jose Dela Cruz', p: '09991234567', r: 'Brother' }],
  is_public: false, sms: true, lastModified: 1757570000000,
};
const heavy = {
  ...typical,
  a: ['Penicillin', 'Aspirin', 'Ibuprofen', 'Sulfa drugs', 'Shellfish', 'Peanuts', 'Latex'],
  c: ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Chronic Kidney Disease stage 3', 'Stroke history'],
  meds: ['Metformin 500mg 2x daily', 'Losartan 50mg', 'Atorvastatin 20mg', 'Salbutamol inhaler PRN', 'Clopidogrel 75mg'],
  kin: [...typical.kin, { n: 'Ana Dela Cruz-Santos', p: '09271234567', r: 'Daughter' }, { n: 'Pedro Santos', p: '09351234567', r: 'Son-in-law' }],
};

// Same NDEF message the app writes (services/nfc.ts buildMessage), as TLV bytes.
function onTagBytes(payload) {
  const msg = Ndef.encodeMessage([
    Ndef.record(Ndef.TNF_MIME_MEDIA, F.TAG_MIME_TYPE, [], Array.from(payload)),
    Ndef.textRecord('LifeTap medical ID. Scan with the LifeTap app, or call 911.'),
    Ndef.androidApplicationRecord('com.lifetap'),
  ]);
  return N.ndefTlvSize(msg.length);
}

// ── 1. Payload encryption ───────────────────────────────────────────────────

console.log('\nPayload encryption (format v2)');
const k1 = keysWith(resp1, 1);
for (const [name, p] of [['typical', typical], ['heavy', heavy]]) {
  const bytes = F.encodeTagPayload(p, k1);
  const size = onTagBytes(bytes);
  check(size <= 872, `${name} profile fits an NTAG216: ${size} of 872 bytes`);
  const c = F.decodeTagPayload(bytes, civilian);
  check(c.restricted === 'no_key' && c.fields.n === p.n && c.fields.bt === p.bt &&
    c.fields.a === undefined && c.fields.dob === undefined && c.fields.kin === undefined,
    `${name}: LifeTap without the responder key sees only ID, name, blood type, SMS choice`);
  const r = F.decodeTagPayload(bytes, responder({ 1: resp1 }));
  check(r.restricted === false && same(r.fields.a, p.a) && same(r.fields.kin, p.kin) &&
    r.fields.dob === p.dob && r.fields.lastModified === p.lastModified,
    `${name}: responder key opens the full profile`);
}
const pub = F.encodeTagPayload({ ...typical, is_public: true }, k1);
const pubC = F.decodeTagPayload(pub, civilian);
check(pubC.restricted === false && pubC.fields.is_public === true && same(pubC.fields.a, typical.a),
  'public profile is fully readable without the responder key');
const t = F.encodeTagPayload(typical, k1);
const flip = (i) => { const b = t.slice(); b[i] ^= 1; return b; };
check(await throws(() => F.decodeTagPayload(flip(20), civilian)), 'tampered section A is rejected');
check(F.decodeTagPayload(flip(t.length - 5), responder({ 1: resp1 })).restricted === 'invalid',
  'tampered section B is flagged, not shown as data');
const hdr = t.slice(); hdr[1] = 1;
check(await throws(() => F.decodeTagPayload(hdr, civilian)), 'flipping the header to "public" is rejected (authenticated header)');
check(await throws(() => F.decodeTagPayload(t, { appSecrets: { 1: randomBytes(32) }, responderSecrets: {} })),
  'a different app secret cannot read section A');
check(F.decodeTagPayload(t, responder({ 1: x25519.utils.randomSecretKey() })).restricted === 'invalid',
  'a wrong responder key cannot read section B');
check(!same(Array.from(F.encodeTagPayload(typical, k1)), Array.from(F.encodeTagPayload(typical, k1))),
  'every write encrypts differently (random nonce + ephemeral key)');
check(await throws(() => F.decodeTagPayload(Uint8Array.from([1, 0, 1, 1, 0, 0]), civilian)),
  'unknown format version is rejected');
const pw1 = F.ntagPassword(appSecret, Uint8Array.from([4, 1, 2, 3, 4, 5, 6]));
const pw2 = F.ntagPassword(appSecret, Uint8Array.from([4, 1, 2, 3, 4, 5, 7]));
check(pw1.pwd.length === 4 && pw1.pack.length === 2 && !same(pw1.pwd, pw2.pwd),
  'NTAG password is 4 bytes + 2-byte PACK and differs per tag UID');

// ── 2. Responder key rotation ───────────────────────────────────────────────

console.log('\nResponder key rotation');
const tagOld = F.encodeTagPayload(typical, keysWith(resp1, 1));
const tagNew = F.encodeTagPayload(typical, keysWith(resp2, 2));
check(tagOld[3] === 1 && tagNew[3] === 2, 'header records which responder key sealed the tag');
check(F.decodeTagPayload(tagOld, responder({ 1: resp1, 2: resp2 })).restricted === false &&
  F.decodeTagPayload(tagNew, responder({ 1: resp1, 2: resp2 })).restricted === false,
  'after rotation, responders holding both keys read old and new tags');
check(F.decodeTagPayload(tagNew, responder({ 1: resp1 })).restricted === 'no_key',
  'a responder who has not refreshed yet gets "no key" (not garbage) for new tags');
const retired = F.decodeTagPayload(tagOld, responder({ 2: resp2 }));
check(retired.restricted === 'no_key' && retired.fields.n === typical.n,
  'after retiring key 1, old tags still identify the person but medical data is locked');
check(F.decodeTagPayload(tagNew, civilian).fields.n === typical.n,
  'rotation does not affect what civilians can read');

// ── 3. NTAG216 write protection (simulated chip) ────────────────────────────

function makeNtag216() {
  const pages = Array.from({ length: 0xe7 }, () => [0, 0, 0, 0]);
  pages[3] = [0xe1, 0x10, 0x6d, 0x00];      // CC: NDEF, 0x6D * 8 = 872 bytes, writable
  pages[4] = [0x03, 0x00, 0xfe, 0x00];      // factory empty NDEF
  pages[0xe3] = [0x04, 0x00, 0x00, 0xff];   // CFG0: AUTH0 = 0xFF (protection off)
  pages[0xe4] = [0x00, 0x05, 0x00, 0x00];   // CFG1: ACCESS
  pages[0xe5] = [0xff, 0xff, 0xff, 0xff];   // PWD (reads back as zeros)
  pages[0xe6] = [0x00, 0x00, 0x00, 0x00];   // PACK
  const tag = { pages, auth: false, writes: 0, failAfterWrites: Infinity };
  tag.transceive = async (cmd) => {
    const [op, p] = cmd;
    if (op === 0x60) return [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x13, 0x03];
    if (op === 0x30) {
      return [0, 1, 2, 3].flatMap((i) => (p + i === 0xe5 || p + i === 0xe6 ? [0, 0, 0, 0] : [...(pages[p + i] ?? [0, 0, 0, 0])]));
    }
    if (op === 0x1b) {
      if (same(cmd.slice(1, 5), pages[0xe5])) { tag.auth = true; return pages[0xe6].slice(0, 2); }
      tag.auth = false;
      throw new Error('NAK');
    }
    if (op === 0xa2) {
      if (tag.writes >= tag.failAfterWrites) throw new Error('Tag was lost');
      if (p >= pages[0xe3][3] && !tag.auth) return [0x00];
      tag.writes++;
      pages[p] = cmd.slice(2, 6);
      return [0x0a];
    }
    throw new Error('unsupported command');
  };
  tag.newSession = () => { tag.auth = false; };
  return tag;
}

console.log('\nNTAG216 write protection (simulated chip)');
const msg = (n) => Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0xff);
const pwd = [0x12, 0x34, 0x56, 0x78];
const pack = [0xab, 0xcd];
const tag = makeNtag216();
const tx = tag.transceive;
let info = await N.identify(tx);
check(info.model.name === 'NTAG216' && info.capacity === 872 && !N.isProtected(info),
  'identifies a factory NTAG216 (872 bytes, unprotected)');
check(await N.readNdefMessage(tx, info) === null, 'factory tag reads as empty');
const m1 = msg(705);
await N.writeNdefMessage(tx, info, m1);
await N.enableProtection(tx, info, pwd, pack);
tag.newSession(); info = await N.identify(tx);
check(N.isProtected(info) && info.protectedFrom === 4, 'first write turns on protection from page 4');
check(same(await N.readNdefMessage(tx, info), m1), 'data reads back without the password (705 bytes)');
check(await throws(() => N.writeNdefMessage(tx, info, msg(20))), 'writing without the password is refused');
check(same(await N.readNdefMessage(tx, info), m1), 'a refused write leaves the data intact');
tag.newSession(); check(!(await N.authenticate(tx, [1, 2, 3, 4], pack)), 'wrong password is rejected');
tag.newSession(); check(!(await N.authenticate(tx, pwd, [0, 0])), 'unexpected PACK is treated as failure');
tag.newSession(); check(await N.authenticate(tx, pwd, pack), 'correct password + PACK is accepted');
const m2 = msg(120);
await N.writeNdefMessage(tx, info, m2);
check(same(await N.readNdefMessage(tx, info), m2), 'rewrite after authentication works');
tag.newSession(); await N.authenticate(tx, pwd, pack);
tag.failAfterWrites = tag.writes + 10;
check(await throws(() => N.writeNdefMessage(tx, info, msg(400))), 'removing the tag mid-write reports an error');
tag.failAfterWrites = Infinity; tag.newSession();
check(await N.readNdefMessage(tx, await N.identify(tx)) === null, 'an interrupted write leaves an empty tag, not corrupt data');
await N.authenticate(tx, pwd, pack); info = await N.identify(tx);
await N.writeNdefMessage(tx, info, [0xd0, 0x00, 0x00]);
await N.disableProtection(tx, info);
tag.newSession(); info = await N.identify(tx);
check(!N.isProtected(info) && same(await N.readNdefMessage(tx, info), [0xd0, 0x00, 0x00]),
  'erase leaves one empty record and removes protection');
check(N.ndefTlvSize(705) === 710 && N.ndefTlvSize(200) === 203, 'TLV size math (long and short form)');
async function identifyFails(patch, reason) {
  const x = makeNtag216(); patch(x);
  try { await N.identify(x.transceive); return false; } catch (e) { return e.reason === reason; }
}
check(await identifyFails((x) => { const o = x.transceive; x.transceive = async (c) => (c[0] === 0x60 ? [0, 4, 3, 1, 1, 0, 0x0b, 3] : o(c)); }, 'unsupported'),
  'a non-NTAG chip (MIFARE Ultralight) is reported as unsupported');
check(await identifyFails((x) => { x.pages[3] = [0, 0, 0, 0]; }, 'not_ndef'), 'a tag without an NDEF capability container is rejected');
check(await identifyFails((x) => { x.pages[3] = [0xe1, 0x10, 0x6d, 0x0f]; }, 'read_only'), 'a permanently read-only tag is rejected');

// ── Summary ─────────────────────────────────────────────────────────────────

const start = performance.now();
for (let i = 0; i < 20; i++) F.decodeTagPayload(F.encodeTagPayload(typical, k1), responder({ 1: resp1 }));
console.log(`\nencode + decode: ${((performance.now() - start) / 20).toFixed(1)} ms average (Node; phones are slower)`);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
