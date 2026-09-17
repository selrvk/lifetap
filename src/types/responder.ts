import type { Kin } from '../storage/asyncStorage';

export type UserRole = 'civilian' | 'medic' | 'responder' | 'admin' | null;

export type ResponderProfile = {
  phone: string;
  full_name: string;
  role: 'medic' | 'responder' | 'admin';
  city: string | null;
  badge_no: string | null;
  organization: string | null;
};

export type ReportEntry = {
  id: string;
  tagId: string;
  n: string;
  bt: string;
  dob: string;
  a: string[];
  c: string[];
  meds: string[];
  kin: Kin[];
  scannedAt: number;
  smsSent: boolean;
  // Set when the scan couldn't decrypt the responder-only section: medical and
  // contact fields are unknown (not empty). Cleared by a later full scan.
  restricted?: 'no_key' | 'invalid';
};

export type Report = {
  id: string;
  // Supabase auth user id of the responder who created it. Missing on reports
  // created before per-user scoping — those are matched by responderPhone.
  ownerId?: string;
  name: string;
  date: string;
  location: string;
  responderName: string;
  responderPhone: string;
  city: string | null;
  isActive: boolean;
  entries: ReportEntry[];
  createdAt: number;
  // Unix ms of the last local change. Used to avoid marking a report synced
  // when it changed while its upload was in flight.
  updatedAt?: number;
  syncedToCloud: boolean;
};
