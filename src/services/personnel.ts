import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  saveCloudSession,
  CloudSession,
  PersonnelFields,
} from '../storage/asyncStorage';

export type PersonnelLookup =
  | { status: 'found'; personnel: PersonnelFields }
  | { status: 'not_found' }
  | { status: 'error' };

// Distinguishes "not personnel" from "couldn't reach the server" so a network
// failure never silently demotes (or promotes) anyone.
export async function lookupPersonnel(phone: string): Promise<PersonnelLookup> {
  try {
    const { data, error } = await supabase
      .from('personnel')
      .select('full_name, role, city, badge_no, organization')
      .eq('phone', phone)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return { status: 'error' };
    return data ? { status: 'found', personnel: data as PersonnelFields } : { status: 'not_found' };
  } catch {
    return { status: 'error' };
  }
}

// Called right after a successful OTP verification. `phone` is E.164 (+639…).
export async function saveLoginSession(
  authSession: Session,
  phone: string
): Promise<{ session: CloudSession; personnelCheckFailed: boolean }> {
  const lookup = await lookupPersonnel(phone);
  const personnel = lookup.status === 'found' ? lookup.personnel : null;

  const session: CloudSession = {
    access_token: authSession.access_token,
    refresh_token: authSession.refresh_token,
    phone,
    user_id: authSession.user.id,
    expires_at: (authSession.expires_at ?? 0) * 1000,
    role: personnel?.role ?? null,
    full_name: personnel?.full_name ?? null,
    city: personnel?.city ?? null,
    badge_no: personnel?.badge_no ?? null,
    organization: personnel?.organization ?? null,
    personnel_verified_at: personnel ? Date.now() : null,
  };
  await saveCloudSession(session);
  return { session, personnelCheckFailed: lookup.status === 'error' };
}
