import { supabase } from '../lib/supabase';
import type { Report } from '../types/responder';
import {
  getAllReports,
  markReportSynced,
  isReportOwnedBy,
  ReportOwner,
} from '../storage/asyncStorage';

export type SyncResult = { ok: boolean; error?: string };

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
    if (error) return { ok: false, error: error.message };
    // Only marks it synced if nothing changed while the upload was in flight.
    await markReportSynced(report.id, report.updatedAt);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
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
