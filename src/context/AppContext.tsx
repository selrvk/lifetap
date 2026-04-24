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
  CloudSession,
  getActiveReport as storageGetActiveReport,
  setActiveReport as storageSetActiveReport,
  getAllReports as storageGetAllReports,
  saveReport as storageSaveReport,
  addEntryToReport as storageAddEntryToReport,
} from '../storage/asyncStorage';
import { syncAllUnsyncedReports } from '../services/reports';
import type {
  Report,
  ReportEntry,
  ResponderProfile,
  UserRole,
} from '../types/responder';

type AppContextValue = {
  role: UserRole;
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
  getAllReports: () => Promise<Report[]>;
  addVictimToReport: (
    reportId: string,
    victim: ReportEntry
  ) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function roleFromSession(session: CloudSession | null): UserRole {
  if (!session) return null;
  return session.role ?? 'civilian';
}

function profileFromSession(
  session: CloudSession | null
): ResponderProfile | null {
  if (!session || !session.role || !session.full_name) return null;
  return {
    phone: session.phone,
    full_name: session.full_name,
    role: session.role,
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

  const refreshSession = useCallback(async () => {
    const session = await getCloudSession();
    setRole(roleFromSession(session));
    setResponderProfile(profileFromSession(session));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, active] = await Promise.all([
          getCloudSession(),
          storageGetActiveReport(),
        ]);
        setRole(roleFromSession(session));
        setResponderProfile(profileFromSession(session));
        setActiveReportState(active);
      } finally {
        setIsLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshSession();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshSession]);

  // Background sync: on app foreground (and once on mount while personnel),
  // upload any reports marked syncedToCloud: false. Silent — never blocks UI.
  const syncingRef = useRef(false);
  const isPersonnel =
    role === 'medic' || role === 'responder' || role === 'admin';

  const runBackgroundSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (!isPersonnel) return;
    syncingRef.current = true;
    try {
      const res = await syncAllUnsyncedReports();
      if (res.succeeded > 0) {
        // refresh active report from storage so UI reflects new synced state
        const active = await storageGetActiveReport();
        setActiveReportState(active);
      }
    } catch {
      // swallow — offline or server error; next foreground will retry
    } finally {
      syncingRef.current = false;
    }
  }, [isPersonnel]);

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
        id: `rep-${Date.now()}`,
        name,
        date,
        location,
        responderName: responderProfile?.full_name ?? 'Unknown',
        responderPhone: responderProfile?.phone ?? '',
        city: responderProfile?.city ?? null,
        isActive: true,
        entries: [],
        createdAt: Date.now(),
        syncedToCloud: false,
      };
      await storageSaveReport(report);
      await storageSetActiveReport(report);
      setActiveReportState(report);
      return report;
    },
    [responderProfile]
  );

  const getAllReports = useCallback(async () => {
    return storageGetAllReports();
  }, []);

  const addVictimToReport = useCallback(
    async (reportId: string, victim: ReportEntry) => {
      const updated = await storageAddEntryToReport(reportId, victim);
      if (updated && activeReport?.id === reportId) {
        setActiveReportState(updated);
      }
    },
    [activeReport]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      role,
      responderProfile,
      activeReport,
      isLoading,
      refreshSession,
      setActiveReport,
      deactivateReport,
      createReport,
      getAllReports,
      addVictimToReport,
    }),
    [
      role,
      responderProfile,
      activeReport,
      isLoading,
      refreshSession,
      setActiveReport,
      deactivateReport,
      createReport,
      getAllReports,
      addVictimToReport,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
