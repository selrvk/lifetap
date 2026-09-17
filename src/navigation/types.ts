export type RootStackParamList = {
  Main: undefined;
  ReadNFC: undefined;
  // ownId: the profile id the tag should hold, for an erase after the profile
  // itself was deleted (so the tag isn't mistaken for someone else's).
  WriteNFC: { mode?: 'write' | 'erase'; ownId?: string } | undefined;
  SyncOverlay: undefined;
  Success: { message: string; subMessage?: string };
  NFCResult: { data: any; fromReport?: string | null; viewOnly?: boolean };
  NewReport: undefined;
  ReportDetail: { reportId: string };
};

export type TabParamList = {
  Home: undefined;
  Profile: undefined;
  Account: undefined;
  NFCResult: { data: any };
};

export type ResponderTabParamList = {
  Scan: undefined;
  Reports: undefined;
  Settings: undefined;
};