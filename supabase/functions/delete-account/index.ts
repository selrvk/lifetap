// Supabase Edge Function — delete-account
// Deletes the authenticated user's data and auth record from Supabase.
//
// Required secrets (automatically available in Edge Functions):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy delete-account

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno std import (resolved at runtime in Supabase)
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  // @ts-ignore Deno global
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // @ts-ignore Deno global
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // @ts-ignore Deno global
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify the caller's JWT and resolve their user ID
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Delete the user's profile row (users table keyed by owner_id)
  const { error: profileError } = await adminClient
    .from('users')
    .delete()
    .eq('owner_id', user.id);

  if (profileError) {
    return json({ error: `Failed to delete profile: ${profileError.message}` }, 500);
  }

  // Delete the auth user — this is the permanent, irreversible step
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ error: `Failed to delete account: ${deleteError.message}` }, 500);
  }

  return json({ ok: true });
});
