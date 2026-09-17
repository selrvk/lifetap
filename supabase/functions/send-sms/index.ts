// Supabase Edge Function — send-sms
// Deploys to Deno runtime. Sends SMS via Twilio REST API.
//
// Only active personnel may send alerts. The responder name in the message is
// taken from the personnel record (not the client), recipients are limited to
// PH mobile numbers, and each responder is rate-limited. Every alert is
// recorded in public.audit_log (see lifetap-dashboard/db/audit.sql).
//
// Required secrets (supabase secrets set ...):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER   (E.164, e.g. +15551234567)
// Optional:
//   SMS_ALERTS_PER_HOUR   (default 60 alerts per responder per hour)
// Available automatically: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy send-sms

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno std import (resolved at runtime in Supabase)
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Payload = {
  to: string[];
  victimName: string;
  location: string;
  time: string;
};

const MAX_RECIPIENTS = 5;
const PH_MOBILE = /^\+639\d{9}$/;

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

// Collapse whitespace and cap length so a client can't inject extra lines or
// turn the alert into an arbitrary message.
function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function buildMessage(p: Payload, responderName: string): string {
  return (
    `[LifeTap Alert]\n` +
    `${p.victimName} has been found by an emergency responder.\n\n` +
    `Location: ${p.location}\n` +
    `Time: ${p.time}\n` +
    `Responder: ${responderName}\n\n` +
    `This is an automated message from LifeTap.`
  );
}

async function sendOne(
  to: string,
  body: string,
  sid: string,
  token: string,
  from: string
): Promise<{ to: string; ok: boolean; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = btoa(`${sid}:${token}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      // Log Twilio's details server-side only — don't echo them to the client.
      console.error('[send-sms] twilio error', res.status, await res.text());
      return { to, ok: false, error: 'send_failed' };
    }
    return { to, ok: true };
  } catch (e: any) {
    console.error('[send-sms] twilio request failed', String(e?.message ?? e));
    return { to, ok: false, error: 'send_failed' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  // @ts-ignore Deno global
  const env = (k: string) => Deno.env.get(k);
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) {
    return json({ error: 'twilio_not_configured' }, 500);
  }
  // A missing or mistyped value falls back to 60 instead of disabling the limit
  // (Number('abc') is NaN, and count >= NaN is always false).
  const configuredLimit = Number(env('SMS_ALERTS_PER_HOUR'));
  const alertsPerHour = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 60;

  // ── Caller must be active personnel ───────────────────────────────────────
  const userClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user?.phone) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const callerPhone = '+' + user.phone.replace(/\D/g, '');
  const { data: personnel, error: personnelError } = await admin
    .from('personnel')
    .select('id, full_name, role')
    .eq('phone', callerPhone)
    .eq('is_active', true)
    .maybeSingle();

  if (personnelError) {
    console.error('[send-sms] personnel lookup failed', personnelError.message);
    return json({ error: 'server_error' }, 500);
  }
  if (!personnel) {
    return json({ error: 'forbidden' }, 403);
  }

  // ── Validate payload ──────────────────────────────────────────────────────
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const payload: Payload = {
    to: Array.isArray(raw?.to) ? raw.to : [],
    victimName: clean(raw?.victimName, 80),
    location: clean(raw?.location, 120),
    time: clean(raw?.time, 40),
  };
  if (!payload.victimName || !payload.location || !payload.time) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const numbers = [...new Set(
    payload.to.filter((n): n is string => typeof n === 'string' && PH_MOBILE.test(n))
  )].slice(0, MAX_RECIPIENTS);
  if (numbers.length === 0) {
    return json({ error: 'no_valid_numbers' }, 400);
  }

  // ── Rate limit (fails open: an audit-log outage must not block an alert) ─
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('actor_personnel_id', personnel.id)
    .eq('action', 'send_sms_alert')
    .gte('created_at', since);
  if (countError) {
    console.error('[send-sms] rate-limit check failed', countError.message);
  } else if ((count ?? 0) >= alertsPerHour) {
    return json({ error: 'rate_limited' }, 429);
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const body = buildMessage(payload, personnel.full_name);
  const results = await Promise.all(
    numbers.map((n) => sendOne(n, body, sid, token, from))
  );
  const sentCount = results.filter((r) => r.ok).length;

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_personnel_id: personnel.id,
    actor_phone: null,
    actor_role: personnel.role,
    action: 'send_sms_alert',
    resource_type: 'sms',
    resource_id: null,
    metadata: { recipient_count: numbers.length, sent_count: sentCount, source: 'mobile' },
  });
  if (auditError) {
    console.error('[send-sms] audit insert failed', auditError.message);
  }

  return json({ ok: sentCount > 0, results }, sentCount > 0 ? 200 : 502);
});
