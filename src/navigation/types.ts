export type RootStackParamList = {
  Main: undefined;
  ReadNFC: undefined;
  WriteNFC: undefined;
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