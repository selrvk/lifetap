import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ReportEntry } from '../types/responder';
// The send-sms Edge Function only accepts PH mobile numbers.
import { PH_MOBILE_E164, toPHE164 } from './phone';

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
    ...new Set(victim.kin.map((k) => toPHE164(k.p)).filter((n) => PH_MOBILE_E164.test(n))),
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
