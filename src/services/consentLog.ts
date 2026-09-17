import { supabase } from '../lib/supabase';
import {
  appendConsentEvent,
  getCloudSession,
  getConsentLog,
  getLocalUser,
  markConsentEventsUploaded,
  ConsentChoices,
  ConsentEvent,
  ConsentEventKind,
  ConsentRecord,
  LocalUser,
} from '../storage/asyncStorage';

// Consent history — evidence of what each person agreed to and when (RA 10173
// accountability). Every event is kept on the phone. Profiles with cloud
// backup on also copy it to public.consent_events, which is append-only.

export function choicesOf(consent: ConsentRecord): ConsentChoices {
  return {
    smsAlerts: consent.smsAlerts,
    cloudBackup: consent.cloudBackup,
    contactsConfirmed: consent.contactsConfirmed,
    guardian: consent.guardian,
  };
}

function sameChoices(a: ConsentChoices, b: ConsentChoices): boolean {
  return (
    a.smsAlerts === b.smsAlerts &&
    a.cloudBackup === b.cloudBackup &&
    a.contactsConfirmed === b.contactsConfirmed &&
    a.guardian?.name === b.guardian?.name &&
    a.guardian?.relationship === b.guardian?.relationship
  );
}

// Which event a consent save represents, or null when nothing changed.
export function consentChangeKind(
  previous: ConsentRecord | undefined,
  next: ConsentRecord
): ConsentEventKind | null {
  if (!previous) return 'given';
  if (previous.version !== next.version) return 'renewed';
  return sameChoices(choicesOf(previous), choicesOf(next)) ? null : 'changed';
}

// Records an event for the user's current consent (call after saving it).
// Never throws: a history write must not block the consent change itself.
export async function recordConsentEvent(kind: ConsentEventKind, user: LocalUser): Promise<void> {
  if (!user.consent) return;
  try {
    await appendConsentEvent({
      id: `ce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      at: Date.now(),
      noticeVersion: user.consent.version,
      profileId: user.id,
      choices: choicesOf(user.consent),
      uploaded: false,
    });
    if (user.consent.cloudBackup) await uploadPendingConsentEvents();
  } catch (e) {
    console.warn('[consent] could not record event:', e);
  }
}

// Copies events not yet in the cloud — only for a signed-in profile with cloud
// backup on. Safe to call repeatedly: ids are generated on the phone and the
// insert ignores ones already there. Failures leave them pending for next time.
export async function uploadPendingConsentEvents(): Promise<void> {
  const [session, user] = await Promise.all([getCloudSession(), getLocalUser()]);
  if (!session || !user?.consent?.cloudBackup) return;
  const pending = (await getConsentLog()).filter((e) => !e.uploaded);
  if (pending.length === 0) return;

  const { error } = await supabase.from('consent_events').upsert(
    pending.map((e) => ({
      id: e.id,
      owner_id: session.user_id,
      profile_id: e.profileId,
      event: e.kind,
      notice_version: e.noticeVersion,
      choices: e.choices ?? {},
      occurred_at: new Date(e.at).toISOString(),
    })),
    { onConflict: 'id', ignoreDuplicates: true }
  );
  if (error) {
    console.warn('[consent] history upload failed:', error.message);
    return;
  }
  await markConsentEventsUploaded(pending.map((e) => e.id));
}

export type ConsentHistory = {
  events: ConsentEvent[];   // newest first
  // null: not signed in, so only this phone's history. false: signed in but
  // the cloud copy couldn't be loaded (offline).
  cloudLoaded: boolean | null;
};

// This phone's history merged with the account's cloud history — after a
// restore on a new phone, the earlier events exist only in the cloud.
export async function getConsentHistory(): Promise<ConsentHistory> {
  const [local, session] = await Promise.all([getConsentLog(), getCloudSession()]);
  const byId = new Map(local.map((e) => [e.id, e]));
  let cloudLoaded: boolean | null = null;

  if (session) {
    const { data, error } = await supabase
      .from('consent_events')
      .select('id, event, notice_version, profile_id, choices, occurred_at')
      .eq('owner_id', session.user_id)
      .order('occurred_at', { ascending: false })
      .limit(200);
    cloudLoaded = !error;
    for (const row of data ?? []) {
      const known = byId.get(row.id);
      if (known) {
        byId.set(row.id, { ...known, uploaded: true });
        continue;
      }
      const choices = row.choices && Object.keys(row.choices).length > 0 ? row.choices : null;
      byId.set(row.id, {
        id: row.id,
        kind: row.event,
        at: new Date(row.occurred_at).getTime(),
        noticeVersion: row.notice_version,
        profileId: row.profile_id,
        choices,
        uploaded: true,
      });
    }
  }

  return {
    events: [...byId.values()].sort((a, b) => b.at - a.at),
    cloudLoaded,
  };
}
