import { supabase } from '../lib/supabase';
import type { Report } from '../types/responder';
import {
  getAllReports,
  markReportSynced,
  isReportOwnedBy,
  ReportOwner,
} from '../storage/asyncStorage';

export type SyncResult = { ok: boolean; error?: string };

// Postgres "insufficient_privilege": the row-level security policy refused the
// report. For reports that means the account isn't active personnel, or the
// report's city doesn't match the city on the responder's personnel record
// (including a record with no city at all).
const RLS_DENIED = '42501';

// A sentence the responder can act on, instead of the raw database error.
export function reportSyncErrorMessage(error: { code?: string; message?: string }): string {
  const message = error.message ?? '';
  if (error.code === RLS_DENIED || /row-level security/i.test(message)) {
    return 'The server didn’t accept this report. Reports upload to the city on your personnel record, and yours is missing or different from this report’s. Ask your LifeTap admin to check your record. The report stays saved on this phone.';
  }
  if (/network request failed|failed to fetch|network error|timed? ?out/i.test(message)) {
    return 'No internet connection. The report is saved on this phone and uploads automatically the next time you open LifeTap with a signal.';
  }
  return `The report couldn’t be uploaded (${message || 'unknown error'}). It stays saved on this phone — try again later.`;
}

function toRow(report: Report) {
  return {
    id: report.id,
    name: report.name,
    date: report.date,
    location: report.location,
    responder_name: report.responderName,
    responder_phone: report.responderPhone,
    city: report.city,
    entries: report.entries,
    created_at: new Date(report.createdAt).toISOString(),
  };
}

export async function syncReportToCloud(report: Report): Promise<SyncResult> {
  try {
    const { error } = await supabase
      .from('reports')
      .upsert(toRow(report), { onConflict: 'id' });
    if (error) return { ok: false, error: reportSyncErrorMessage(error) };
    // Only marks it synced if nothing changed while the upload was in flight.
    await markReportSynced(report.id, report.updatedAt);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: reportSyncErrorMessage({ message: String(e?.message ?? e) }) };
  }
}

// Only the signed-in responder's reports — uploading someone else's would
// file it under this account (the server stamps created_by = caller).
export async function syncAllUnsyncedReports(owner: ReportOwner): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const all = await getAllReports();
  const pending = all.filter((r) => !r.syncedToCloud && isReportOwnedBy(r, owner));
  let succeeded = 0;
  let failed = 0;
  for (const r of pending) {
    const res = await syncReportToCloud(r);
    if (res.ok) succeeded++;
    else failed++;
  }
  return { attempted: pending.length, succeeded, failed };
}
