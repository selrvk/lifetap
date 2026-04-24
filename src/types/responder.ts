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
  n: string;
  bt: string;
  dob: string;
  a: string[];
  c: string[];
  meds: string[];
  kin: Kin[];
  scannedAt: number;
  smsSent: boolean;
};

export type Report = {
  id: string;
  name: string;
  date: string;
  location: string;
  responderName: string;
  responderPhone: string;
  city: string | null;
  isActive: boolean;
  entries: ReportEntry[];
  createdAt: number;
  syncedToCloud: boolean;
};
