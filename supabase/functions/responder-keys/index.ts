// Supabase Edge Function — responder-keys
// Hands the tag-decryption private keys (section B of LifeTap tags) to ACTIVE
// personnel only. The app caches them in encrypted storage so responders can
// read tags offline, and deletes them when the account stops being personnel.
//
// Secrets (managed by scripts/tag-keys.mjs):
//   TAG_RESPONDER_KEY_<id>        one hex private key per key id (1, 2, …).
//                                 Rotation adds a new one; retiring an old id
//                                 unsets it, and phones drop it on next refresh.
//   TAG_RESPONDER_PRIVATE_KEYS    legacy: JSON { "<id>": "<hex>" } from the
//                                 first version of the key script. Still read.
// Available automatically: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy responder-keys

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno std import (resolved at runtime in Supabase)
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const HEX_KEY = /^[0-9a-f]{64}$/i;

// Every responder private key currently configured, keyed by key id.
function collectKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  // @ts-ignore Deno global
  const all: Record<string, string> = Deno.env.toObject();

  try {
    const legacy = JSON.parse(all.TAG_RESPONDER_PRIVATE_KEYS ?? '{}');
    for (const [id, hex] of Object.entries(legacy ?? {})) {
      if (/^\d{1,3}$/.test(id) && typeof hex === 'string' && HEX_KEY.test(hex.trim())) {
        keys[id] = hex.trim();
      }
    }
  } catch {
    console.error('[responder-keys] TAG_RESPONDER_PRIVATE_KEYS is not valid JSON');
  }

  for (const [name, value] of Object.entries(all)) {
    const m = /^TAG_RESPONDER_KEY_(\d{1,3})$/.exec(name);
    if (m && HEX_KEY.test(value.trim())) keys[String(Number(m[1]))] = value.trim();
  }
  return keys;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  // @ts-ignore Deno global
  const env = (k: string) => Deno.env.get(k);

  const keys = collectKeys();
  if (Object.keys(keys).length === 0) {
    return json({ error: 'keys_not_configured' }, 500);
  }

  const userClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user?.phone) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: personnel, error: personnelError } = await admin
    .from('personnel')
    .select('id, role')
    .eq('phone', '+' + user.phone.replace(/\D/g, ''))
    .eq('is_active', true)
    .maybeSingle();

  if (personnelError) {
    console.error('[responder-keys] personnel lookup failed', personnelError.message);
    return json({ error: 'server_error' }, 500);
  }
  if (!personnel) return json({ error: 'forbidden' }, 403);

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_personnel_id: personnel.id,
    actor_phone: null,
    actor_role: personnel.role,
    action: 'fetch_tag_keys',
    resource_type: 'tag_keys',
    resource_id: null,
    metadata: { key_ids: Object.keys(keys), source: 'mobile' },
  });
  if (auditError) console.error('[responder-keys] audit insert failed', auditError.message);

  return json({ keys });
});
