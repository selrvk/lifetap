import { supabase } from '../lib/supabase';
import type { ReportEntry } from '../types/responder';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return `+63${digits}`;
}

export type SendVictimAlertResult = {
  ok: boolean;
  error?: string;
  sentTo?: string[];
};

export async function sendVictimAlert(
  victim: ReportEntry,
  location: string,
  responderName: string
): Promise<SendVictimAlertResult> {
  const numbers = victim.kin
    .map((k) => normalizePhone(k.p))
    .filter((n) => n.length >= 10);

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
        responderName,
        time,
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data?.ok) {
      return { ok: false, error: 'sms_send_failed', sentTo: numbers };
    }
    return { ok: true, sentTo: numbers };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
