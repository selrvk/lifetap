import type { ConsentRecord, LocalUser } from '../storage/asyncStorage';

// Mapping between a LocalUser and its row in public.users. consent_given_at /
// consent_version are the columns the dashboard already shows
// (lifetap-dashboard/db/consent.sql); the individual choices go in
// consent_details.

type ConsentDetails = Omit<ConsentRecord, 'version' | 'acceptedAt'>;

export function cloudRowFromProfile(user: LocalUser, id: string, ownerId: string) {
  const { consent } = user;
  const details: ConsentDetails | null = consent
    ? {
        updatedAt: consent.updatedAt,
        smsAlerts: consent.smsAlerts,
        cloudBackup: consent.cloudBackup,
        cloudBackupAt: consent.cloudBackupAt,
        contactsConfirmed: consent.contactsConfirmed,
        guardian: consent.guardian,
      }
    : null;

  return {
    id,
    n: user.n,
    dob: user.dob,
    bt: user.bt,
    brg: user.brg,
    cty: user.cty,
    phn: user.phn,
    rel: user.rel,
    od: user.od,
    a: user.a,
    c: user.c,
    meds: user.meds,
    kin: user.kin,
    is_public: user.is_public,
    owner_id: ownerId,
    updated_at: new Date(user.lastModified).toISOString(),
    consent_given_at: consent ? new Date(consent.acceptedAt).toISOString() : null,
    consent_version: consent?.version ?? null,
    consent_details: details,
  };
}

function consentFromRow(row: any): ConsentRecord | undefined {
  if (!row?.consent_version || !row?.consent_given_at) return undefined;
  const d: Partial<ConsentDetails> = row.consent_details ?? {};
  const acceptedAt = new Date(row.consent_given_at).getTime();
  return {
    version: row.consent_version,
    acceptedAt,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : acceptedAt,
    smsAlerts: d.smsAlerts === true,
    // The row exists in the cloud, so the owner did upload it.
    cloudBackup: d.cloudBackup !== false,
    cloudBackupAt: typeof d.cloudBackupAt === 'number' ? d.cloudBackupAt : null,
    contactsConfirmed: d.contactsConfirmed === true,
    guardian: d.guardian ?? null,
  };
}

// Builds a clean LocalUser from a users row (no stray cloud columns).
// lastModified = updated_at so the next sync compares equal.
export function profileFromCloudRow(row: any): LocalUser {
  return {
    id: row.id,
    n: row.n ?? '',
    dob: row.dob ?? '',
    bt: row.bt ?? '',
    brg: row.brg ?? '',
    cty: row.cty ?? '',
    phn: row.phn ?? '',
    rel: row.rel ?? '',
    od: row.od === true,
    is_public: row.is_public === true,
    a: row.a ?? [],
    c: row.c ?? [],
    meds: row.meds ?? [],
    kin: row.kin ?? [],
    lastModified: new Date(row.updated_at).getTime(),
    syncedToTag: false,
    syncedToCloud: true,
    consent: consentFromRow(row),
  };
}
