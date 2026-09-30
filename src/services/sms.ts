import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ReportEntry } from '../types/responder';
// The send-sms Edge Function only accepts PH mobile numbers.
import { PH_MOBILE_E164, toPHE164 } from './phone';

export type SendVictimAlertResult =
  // requested: how many valid numbers were asked for; sentTo may be fewer.
  | { ok: true; sentTo: string[]; requested: number }
  | { ok: false; message: string };

export type AlertFailure =
  | { kind: 'no_numbers' }
  | { kind: 'offline' }
  | { kind: 'http'; status?: number }
  | { kind: 'not_delivered' };

const CALL_INSTEAD = 'Call the emergency contacts instead';

// What the responder sees when an alert can't go out. No signal is the normal
// case at a disaster scene, so every message says what to do next.
export function alertFailureMessage(f: AlertFailure): string {
  switch (f.kind) {
    case 'no_numbers':
      return 'None of this person’s emergency contacts has a Philippine mobile number (09… or +639…), so an SMS can’t be sent. Call them instead.';
    case 'offline':
      return `No internet connection. SMS alerts go through the LifeTap server, so they need mobile data or Wi-Fi. ${CALL_INSTEAD}, or try again when you have a signal.`;
    case 'not_delivered':
      return `The SMS provider couldn’t deliver the alert. Try again, or ${CALL_INSTEAD.toLowerCase()}.`;
    case 'http':
      switch (f.status) {
        case 401:
          return 'Your session has expired. Sign in again to send alerts.';
        case 403:
          return 'Only active personnel can send alerts. If you were just added, reopen the app while online.';
        case 429:
          return `Too many alerts were sent from your account in the last hour. ${CALL_INSTEAD}, or try again later.`;
        case 502:
          return `The SMS provider couldn’t deliver the alert. Try again, or ${CALL_INSTEAD.toLowerCase()}.`;
        default:
          return `The alert service isn’t available right now. Try again, or ${CALL_INSTEAD.toLowerCase()}.`;
      }
  }
}

const fail = (f: AlertFailure): SendVictimAlertResult => ({ ok: false, message: alertFailureMessage(f) });

// The responder name in the SMS comes from the caller's personnel record on
// the server, so it isn't sent from here.
export async function sendVictimAlert(
  victim: ReportEntry,
  location: string
): Promise<SendVictimAlertResult> {
  const numbers = [
    ...new Set(victim.kin.map((k) => toPHE164(k.p)).filter((n) => PH_MOBILE_E164.test(n))),
  ];

  if (numbers.length === 0) return fail({ kind: 'no_numbers' });

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
      if (error instanceof FunctionsFetchError) return fail({ kind: 'offline' });
      const status = error instanceof FunctionsHttpError ? error.context?.status : undefined;
      return fail({ kind: 'http', status });
    }
    const sentTo: string[] = (data?.results ?? [])
      .filter((r: { ok: boolean }) => r.ok)
      .map((r: { to: string }) => r.to);
    if (!data?.ok || sentTo.length === 0) return fail({ kind: 'not_delivered' });
    return { ok: true, sentTo, requested: numbers.length };
  } catch {
    // invoke() reports network failures as FunctionsFetchError; anything
    // thrown here is also a request that never reached the server.
    return fail({ kind: 'offline' });
  }
}
