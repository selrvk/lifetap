#!/usr/bin/env node
// LifeTap tag-encryption key management.
//
//   node scripts/tag-keys.mjs status          show key ids in .env and on Supabase
//   node scripts/tag-keys.mjs init            first-time setup (app secret + responder key 1)
//   node scripts/tag-keys.mjs rotate          add a new responder key; new tags use it
//   node scripts/tag-keys.mjs retire <id> --yes   delete an old responder key
//
// Responder PRIVATE keys go straight into Supabase secrets
// (TAG_RESPONDER_KEY_<id>) and are never written to disk. The responder-keys
// Edge Function serves every configured id to active personnel, so tags
// sealed to an older key stay readable until that key is retired.
//
// Rotation procedure (e.g. a responder phone was lost):
//   1. node scripts/tag-keys.mjs rotate
//   2. Rebuild and distribute the app (the new public key is baked in).
//      Responders fetch the new key on their next online check; civilians are
//      prompted to rewrite their tags.
//   3. Once tags have been rewritten: node scripts/tag-keys.mjs retire <old id> --yes
//      Tags still sealed to the retired key become unreadable to responders.
//
// The app secret (section A + NTAG passwords) is not rotated here: changing it
// would lock LifeTap out of every write-protected tag. It is not a real secret
// against someone who unpacks the app anyway — see SYSTEM.md.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { x25519 } from '@noble/curves/ed25519.js';

const ENV_PATH = new URL('../.env', import.meta.url);
const [command, ...args] = process.argv.slice(2);

function readEnv() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
}

function getVar(text, name) {
  return new RegExp(`^${name}=(.*)$`, 'm').exec(text)?.[1]?.trim() || null;
}

function setVar(text, name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
}

function supabase(cliArgs, { quiet = false } = {}) {
  const r = spawnSync('supabase', cliArgs, {
    encoding: 'utf8',
    stdio: ['ignore', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
  });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

// Names of the responder-key secrets currently on Supabase.
function serverKeyIds() {
  const r = supabase(['secrets', 'list'], { quiet: true });
  if (!r.ok) return null;
  const ids = new Set();
  let legacy = false;
  for (const m of r.out.matchAll(/TAG_RESPONDER_(KEY_(\d+)|PRIVATE_KEYS)\b/g)) {
    if (m[2]) ids.add(Number(m[2]));
    else legacy = true;
  }
  if (legacy) ids.add(1); // the legacy JSON secret only ever held key 1
  return { ids: [...ids].sort((a, b) => a - b), legacy };
}

function fingerprint(hex) {
  return hex ? bytesToHex(sha256(hexToBytes(hex))).slice(0, 12) : '—';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function newResponderKey() {
  const secret = x25519.utils.randomSecretKey();
  return { secretHex: bytesToHex(secret), publicHex: bytesToHex(x25519.getPublicKey(secret)) };
}

function status() {
  const env = readEnv();
  const current = getVar(env, 'TAG_RESPONDER_KEY_ID');
  console.log('.env');
  console.log(`  TAG_APP_SECRET            ${getVar(env, 'TAG_APP_SECRET') ? 'set' : 'MISSING'}`);
  console.log(`  TAG_RESPONDER_KEY_ID      ${current ?? 'MISSING'}  (new tags are sealed to this key)`);
  console.log(`  TAG_RESPONDER_PUBLIC_KEY  fingerprint ${fingerprint(getVar(env, 'TAG_RESPONDER_PUBLIC_KEY'))}`);
  const server = serverKeyIds();
  if (!server) {
    console.log('\nSupabase: could not list secrets (is the CLI logged in and linked?)');
    return;
  }
  console.log(`\nSupabase responder keys: ${server.ids.length ? server.ids.join(', ') : 'NONE'}` +
    (server.legacy ? '  (key 1 is in the legacy TAG_RESPONDER_PRIVATE_KEYS secret)' : ''));
  if (current && !server.ids.includes(Number(current))) {
    console.log(`\n⚠ Key ${current} is in .env but not on Supabase — responders can't read new tags.`);
  }
}

function init() {
  let env = readEnv();
  if (getVar(env, 'TAG_RESPONDER_PUBLIC_KEY') && !args.includes('--force')) {
    fail('Tag keys already exist. Use `rotate` to add a responder key. (`init --force` replaces\n' +
      'everything and makes every tag written so far unreadable and locked to LifeTap.)');
  }
  const { secretHex, publicHex } = newResponderKey();
  if (!supabase(['secrets', 'set', `TAG_RESPONDER_KEY_1=${secretHex}`]).ok) {
    fail('\nCould not store the Supabase secret. Nothing was changed.');
  }
  env = setVar(env, 'TAG_APP_SECRET', bytesToHex(randomBytes(32)));
  env = setVar(env, 'TAG_APP_KEY_ID', '1');
  env = setVar(env, 'TAG_RESPONDER_PUBLIC_KEY', publicHex);
  env = setVar(env, 'TAG_RESPONDER_KEY_ID', '1');
  writeFileSync(ENV_PATH, env);
  console.log('\n✓ Responder key 1 stored on Supabase; .env updated.\n' +
    'Next: supabase functions deploy responder-keys, then rebuild the app.');
}

function rotate() {
  let env = readEnv();
  const current = Number(getVar(env, 'TAG_RESPONDER_KEY_ID'));
  if (!getVar(env, 'TAG_APP_SECRET') || !current) fail('No tag keys in .env yet — run `init` first.');
  const server = serverKeyIds();
  const next = Math.max(current, ...(server?.ids ?? [])) + 1;
  if (next > 255) fail('Key ids are exhausted (max 255).');

  const { secretHex, publicHex } = newResponderKey();
  if (!supabase(['secrets', 'set', `TAG_RESPONDER_KEY_${next}=${secretHex}`]).ok) {
    fail('\nCould not store the Supabase secret. Nothing was changed.');
  }
  env = setVar(env, 'TAG_RESPONDER_PUBLIC_KEY', publicHex);
  env = setVar(env, 'TAG_RESPONDER_KEY_ID', String(next));
  writeFileSync(ENV_PATH, env);
  console.log(`
✓ Responder key ${next} stored on Supabase; .env now seals new tags to key ${next}.
  Key ${current} stays available so existing tags remain readable.

Next:
  1. Rebuild and distribute the app, and share the updated .env with your team.
     Responders pick up key ${next} on their next online check; civilians are
     prompted to rewrite their tags.
  2. After tags have been rewritten: node scripts/tag-keys.mjs retire ${current} --yes`);
}

function retire() {
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id < 1) fail('Usage: node scripts/tag-keys.mjs retire <id> --yes');
  const current = Number(getVar(readEnv(), 'TAG_RESPONDER_KEY_ID'));
  if (id === current) fail(`Key ${id} is the one new tags are sealed to. Rotate first.`);
  const server = serverKeyIds();
  if (!server) fail('Could not list Supabase secrets (is the CLI logged in and linked?).');
  if (!server.ids.includes(id)) fail(`Key ${id} is not on Supabase.`);
  if (!args.includes('--yes')) {
    fail(`This deletes responder key ${id}. Tags still sealed to it become unreadable to\n` +
      'responders (they see "couldn’t be unlocked"). Re-run with --yes to confirm.');
  }
  const names = [`TAG_RESPONDER_KEY_${id}`];
  if (id === 1 && server.legacy) names.push('TAG_RESPONDER_PRIVATE_KEYS');
  const listed = supabase(['secrets', 'list'], { quiet: true }).out;
  const present = names.filter((n) => new RegExp(`\\b${n}\\b`).test(listed));
  if (!supabase(['secrets', 'unset', ...present]).ok) fail('\nCould not unset the secret.');
  console.log(`\n✓ Responder key ${id} deleted. Phones drop it on their next online check.`);
}

switch (command) {
  case 'status': status(); break;
  case 'init': init(); break;
  case 'rotate': rotate(); break;
  case 'retire': retire(); break;
  default:
    fail('Usage: node scripts/tag-keys.mjs <status | init | rotate | retire <id> --yes>');
}
