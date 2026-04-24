// Supabase Edge Function — send-sms
// Deploys to Deno runtime. Sends SMS via Twilio REST API.
//
// Required secrets (supabase secrets set ...):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER   (E.164, e.g. +15551234567)
//
// Deploy:
//   supabase functions deploy send-sms

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno std import (resolved at runtime in Supabase)
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

type Payload = {
  to: string[];
  victimName: string;
  location: string;
  responderName: string;
  time: string;
};

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

function buildMessage(p: Payload): string {
  return (
    `[LifeTap Alert]\n` +
    `${p.victimName} has been found by an emergency responder.\n\n` +
    `Location: ${p.location}\n` +
    `Time: ${p.time}\n` +
    `Responder: ${p.responderName}\n\n` +
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
      const text = await res.text();
      return { to, ok: false, error: `${res.status}: ${text}` };
    }
    return { to, ok: true };
  } catch (e: any) {
    return { to, ok: false, error: String(e?.message ?? e) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Require a signed-in user (any authenticated JWT — edge function is
  // deployed with verify_jwt=true by default).
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  // @ts-ignore Deno global
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  // @ts-ignore Deno global
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  // @ts-ignore Deno global
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) {
    return json({ error: 'twilio_not_configured' }, 500);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (
    !payload ||
    !Array.isArray(payload.to) ||
    payload.to.length === 0 ||
    !payload.victimName ||
    !payload.location ||
    !payload.responderName ||
    !payload.time
  ) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const body = buildMessage(payload);
  const results = await Promise.all(
    payload.to.map((n) => sendOne(n, body, sid, token, from))
  );

  const allOk = results.every((r) => r.ok);
  return json({ ok: allOk, results }, allOk ? 200 : 502);
});
