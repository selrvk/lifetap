import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  getCloudSession,
  clearCloudSession,
  updateCloudSessionTokens,
  updateCloudSessionPersonnel,
  activeRole,
  CloudSession,
  getActiveReport as storageGetActiveReport,
  setActiveReport as storageSetActiveReport,
  getAllReports as storageGetAllReports,
  getReportById as storageGetReportById,
  saveReport as storageSaveReport,
  addEntryToReport as storageAddEntryToReport,
  updateReportEntry as storageUpdateReportEntry,
  isReportOwnedBy,
  ReportOwner,
} from '../storage/asyncStorage';
import { syncAllUnsyncedReports } from '../services/reports';
import { lookupPersonnel } from '../services/personnel';
import {
  clearResponderKeys,
  ensureResponderKeys,
  refreshResponderKeys,
} from '../crypto/keys';
import type {
  Report,
  ReportEntry,
  ResponderProfile,
  UserRole,
} from '../types/responder';

type AppContextValue = {
  role: UserRole;
  // Supabase auth user id of the signed-in account (null when signed out).
  accountId: string | null;
  responderProfile: ResponderProfile | null;
  activeReport: Report | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  setActiveReport: (report: Report | null) => Promise<void>;
  deactivateReport: () => Promise<void>;
  createReport: (
    name: string,
    location: string,
    date: string
  ) => Promise<Report>;
  // Both only return reports owned by the signed-in account.
  getAllReports: () => Promise<Report[]>;
  getReportById: (id: string) => Promise<Report | null>;
  addVictimToReport: (
    reportId: string,
    victim: ReportEntry
  ) => Promise<void>;
  markVictimSmsSent: (reportId: string, entryId: string) => Promise<void>;
  updateVictimEntry: (
    reportId: string,
    entryId: string,
    patch: Partial<Omit<ReportEntry, 'id'>>
  ) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function roleFromSession(session: CloudSession | null): UserRole {
  if (!session) return null;
  return activeRole(session) ?? 'civilian';
}

function ownerFromSession(session: CloudSession | null): ReportOwner | null {
  return session ? { userId: session.user_id, phone: session.phone } : null;
}

function profileFromSession(
  session: CloudSession | null
): ResponderProfile | null {
  const role = activeRole(session);
  if (!session || !role || !session.full_name) return null;
  return {
    phone: session.phone,
    full_name: session.full_name,
    role,
    city: session.city,
    badge_no: session.badge_no,
    organization: session.organization,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>(null);
  const [responderProfile, setResponderProfile] =
    useState<ResponderProfile | null>(null);
  const [activeReport, setActiveReportState] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [owner, setOwner] = useState<ReportOwner | null>(null);

  // Re-reads the session and reconciles the active report with it. Every
  // sign-out path ends here (AppContext's SIGNED_OUT listener, both Settings
  // screens), so the active report never carries over to the next account.
  const refreshSession = useCallback(async () => {
    const [session, active] = await Promise.all([
      getCloudSession(),
      storageGetActiveReport(),
    ]);
    const nextOwner = ownerFromSession(session);
    setRole(roleFromSession(session));
    setResponderProfile(profileFromSession(session));

    // Responder tag keys live on the device only while the account is active
    // personnel: fetch them if missing, delete them otherwise (sign-out,
    // deactivation, or the offline grace period running out).
    if (activeRole(session)) {
      ensureResponderKeys().catch(() => {});
    } else {
      clearResponderKeys().catch(() => {});
    }
    // Keep the same object when nothing changed so owner-dependent callbacks
    // (and the background sync effect) don't re-run on every token refresh.
    setOwner(prev =>
      prev?.userId === nextOwner?.userId && prev?.phone === nextOwner?.phone
        ? prev
        : nextOwner
    );

    if (active && !isReportOwnedBy(active, nextOwner)) {
      // Signed out, or a different account on a shared device. The report
      // stays saved (and uploads when its owner signs back in) — it just
      // isn't active for anyone else.
      await storageSetActiveReport(null);
      setActiveReportState(null);
    } else {
      setActiveReportState(active);
    }
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, supabaseSession) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (supabaseSession) {
          // Keep our stored copy of the tokens in sync with Supabase's refresh cycle.
          await updateCloudSessionTokens(
            supabaseSession.access_token,
            supabaseSession.refresh_token,
            supabaseSession.expires_at ?? 0,
          );
        }
      } else if (event === 'SIGNED_OUT') {
        // Supabase signed out (e.g. token revoked server-side) — clear our copy too.
        await clearCloudSession();
      }
      refreshSession();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshSession]);

  // Re-check the personnel table on mount and every foreground. Grants the
  // role to newly added personnel and revokes it from deactivated ones.
  // Offline (lookup error) keeps the cached role — see PERSONNEL_OFFLINE_GRACE_MS.
  const verifyingRef = useRef(false);
  const lastVerifiedRef = useRef(0);

  const verifyPersonnel = useCallback(async () => {
    if (verifyingRef.current) return;
    if (Date.now() - lastVerifiedRef.current < 60_000) return;
    verifyingRef.current = true;
    try {
      const session = await getCloudSession();
      if (!session) return;
      // Without a Supabase session the query would run as anon and find no
      // row, which would wrongly look like "not personnel".
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const result = await lookupPersonnel(session.phone);
      if (result.status === 'error') return;
      lastVerifiedRef.current = Date.now();
      await updateCloudSessionPersonnel(
        result.status === 'found' ? result.personnel : null
      );
      // Re-download while online so a key rotation reaches every responder.
      if (result.status === 'found') await refreshResponderKeys();
      await refreshSession();
    } catch (e) {
      console.error('[AppContext] personnel verification failed:', e);
    } finally {
      verifyingRef.current = false;
    }
  }, [refreshSession]);

  useEffect(() => {
    verifyPersonnel();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') verifyPersonnel();
    });
    return () => sub.remove();
  }, [verifyPersonnel]);

  // Background sync: on app foreground (and once on mount while personnel),
  // upload any reports marked syncedToCloud: false. Silent — never blocks UI.
  const syncingRef = useRef(false);
  const isPersonnel =
    role === 'medic' || role === 'responder' || role === 'admin';

  const runBackgroundSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (!isPersonnel || !owner) return;
    syncingRef.current = true;
    try {
      const res = await syncAllUnsyncedReports(owner);
      if (res.succeeded > 0) {
        // refresh active report from storage so UI reflects new synced state
        const active = await storageGetActiveReport();
        setActiveReportState(active);
      }
    } catch (e) {
      console.error('[AppContext] background sync failed:', e);
    } finally {
      syncingRef.current = false;
    }
  }, [isPersonnel, owner]);

  useEffect(() => {
    if (!isPersonnel) return;
    runBackgroundSync();
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') runBackgroundSync();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isPersonnel, runBackgroundSync]);

  const setActiveReport = useCallback(async (report: Report | null) => {
    await storageSetActiveReport(report);
    setActiveReportState(report ? { ...report, isActive: true } : null);
  }, []);

  const deactivateReport = useCallback(async () => {
    await storageSetActiveReport(null);
    setActiveReportState(null);
  }, []);

  const createReport = useCallback(
    async (name: string, location: string, date: string): Promise<Report> => {
      const report: Report = {
        // Random suffix: IDs are the cloud primary key, and two responders can
        // start a report in the same millisecond.
        id: `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        ownerId: owner?.userId,
        name,
        date,
        location,
        responderName: responderProfile?.full_name ?? 'Unknown',
        responderPhone: responderProfile?.phone ?? '',
        city: responderProfile?.city ?? null,
        isActive: true,
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncedToCloud: false,
      };
      await storageSaveReport(report);
      await storageSetActiveReport(report);
      setActiveReportState(report);
      return report;
    },
    [responderProfile, owner]
  );

  const getAllReports = useCallback(async () => {
    const all = await storageGetAllReports();
    return all.filter((r) => isReportOwnedBy(r, owner));
  }, [owner]);

  const getReportById = useCallback(
    async (id: string) => {
      const report = await storageGetReportById(id);
      return report && isReportOwnedBy(report, owner) ? report : null;
    },
    [owner]
  );

  const addVictimToReport = useCallback(
    async (reportId: string, victim: ReportEntry) => {
      const updated = await storageAddEntryToReport(reportId, victim);
      if (updated && activeReport?.id === reportId) {
        setActiveReportState(updated);
      }
    },
    [activeReport]
  );

  const updateVictimEntry = useCallback(
    async (reportId: string, entryId: string, patch: Partial<Omit<ReportEntry, 'id'>>) => {
      const updated = await storageUpdateReportEntry(reportId, entryId, patch);
      if (updated && activeReport?.id === reportId) {
        setActiveReportState(updated);
      }
    },
    [activeReport]
  );

  const markVictimSmsSent = useCallback(
    (reportId: string, entryId: string) => updateVictimEntry(reportId, entryId, { smsSent: true }),
    [updateVictimEntry]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      role,
      accountId: owner?.userId ?? null,
      responderProfile,
      activeReport,
      isLoading,
      refreshSession,
      setActiveReport,
      deactivateReport,
      createReport,
      getAllReports,
      getReportById,
      addVictimToReport,
      markVictimSmsSent,
      updateVictimEntry,
    }),
    [
      role,
      owner,
      responderProfile,
      activeReport,
      isLoading,
      refreshSession,
      setActiveReport,
      deactivateReport,
      createReport,
      getAllReports,
      getReportById,
      addVictimToReport,
      markVictimSmsSent,
      updateVictimEntry,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
