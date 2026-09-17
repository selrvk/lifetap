// Philippine mobile numbers in E.164 (+639XXXXXXXXX): what Supabase phone
// sign-in, the personnel table and the send-sms function all expect.

export const PH_MOBILE_E164 = /^\+639\d{9}$/;

// Accepts 09171234567, 9171234567, 639171234567 or +63 917 123 4567.
export function toPHE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('63')) return `+${digits}`;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return `+63${digits}`;
}

export function isPHMobile(raw: string): boolean {
  return PH_MOBILE_E164.test(toPHE164(raw));
}
