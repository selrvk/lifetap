import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ReportEntry } from '../types/responder';

// Must match the send-sms Edge Function, which only accepts PH mobile numbers.
const PH_MOBILE = /^\+639\d{9}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return `+63${digits}`;
}

const HTTP_ERRORS: Record<number, string> = {
  401: 'your session has expired — sign in again',
  403: 'only active personnel can send alerts',
  429: 'too many alerts sent in the last hour — try again later',
};

export type SendVictimAlertResult = {
  ok: boolean;
  error?: string;
  sentTo?: string[];
};

// The responder name in the SMS comes from the caller's personnel record on
// the server, so it isn't sent from here.
export async function sendVictimAlert(
  victim: ReportEntry,
  location: string
): Promise<SendVictimAlertResult> {
  const numbers = [
    ...new Set(victim.kin.map((k) => normalizePhone(k.p)).filter((n) => PH_MOBILE.test(n))),
  ];

  if (numbers.length === 0) {
    return { ok: false, error: 'no_kin_numbers' };
  }

  const time = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
  });

  try {
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: {
        to: numbers,
        victimName: victim.n,
        location,
        time,
      },
    });

    if (error) {
      const status = error instanceof FunctionsHttpError ? error.context?.status : undefined;
      return { ok: false, error: (status && HTTP_ERRORS[status]) ?? error.message };
    }
    const sentTo: string[] = (data?.results ?? [])
      .filter((r: { ok: boolean }) => r.ok)
      .map((r: { to: string }) => r.to);
    if (!data?.ok || sentTo.length === 0) {
      return { ok: false, error: 'sms_send_failed' };
    }
    return { ok: true, sentTo };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
