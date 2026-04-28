# LifeTap Mobile App — Full System Reference

> Last updated: 2026-04-27  
> Use this document as context when continuing development, onboarding contributors, or building new features. Companion to the admin dashboard's SYSTEM.md.

---

## 1. What the Mobile App Is

LifeTap's mobile app is the field-facing side of the disaster-response medical ID system built for Philippine LGUs. It serves two distinct personas on one codebase:

- **Civilians** register their medical profile, write it to a physical NFC tag (keychain, wristband, or wallet card), and keep it in sync with the cloud.
- **Responders** (medics, barangay health workers, DRRMO staff) scan those NFC tags at an emergency scene to instantly view victim profiles, build disaster reports, and alert next of kin via SMS.

The app determines which persona is active based on whether the logged-in phone number exists in the `personnel` table.

---

## 2. Tech Stack

| Concern | Library / Version |
|---------|------------------|
| Framework | React Native 0.84.1 (bare workflow) |
| Language | TypeScript |
| Styling | NativeWind ^4.1 (Tailwind CSS for RN) |
| Navigation | React Navigation 7 (native-stack + bottom-tabs) |
| State | React Context + EncryptedStorage (no Redux/Zustand) |
| Auth | Supabase phone OTP |
| Database | Supabase (PostgreSQL) |
| Local storage (sensitive) | `react-native-encrypted-storage` ^4.0.3 |
| Local storage (non-sensitive) | `@react-native-async-storage/async-storage` ^2.2.0 |
| NFC | `react-native-nfc-manager` ^3.17.2 |
| SMS | Supabase Edge Function (`send-sms`) via Twilio |
| Env vars | `react-native-config` ^1.6.1 |
| Animations | `react-native-linear-gradient`, `react-native-worklets` |
| Date picker | `@react-native-community/datetimepicker` ^9.1.0 |

---

## 3. Roles & Personas

The same app binary serves all four roles. On login, the app checks the `personnel` table.

```
civilian
  └── Default if phone is NOT in personnel table
  └── Civilian tab navigator (Profile, Home, Settings)
  └── Can create/edit own medical profile
  └── Can write profile to NFC tag
  └── Can sync profile to/from cloud
  └── Cannot see full medical data of others (unless is_public = true)

medic / responder / admin
  └── Activated if phone IS in personnel table with is_active = true
  └── Responder tab navigator (Reports, Scan, Settings)
  └── Can scan any NFC tag and see full medical profile
  └── Can create disaster reports and add victims to them
  └── Can send SMS alerts to victim's next of kin
  └── Reports synced to Supabase (visible in admin dashboard)
```

**Role determination:** Handled in `src/context/AppContext.tsx` and `src/storage/asyncStorage.ts`. The `isPersonnel()` helper returns true for medic/responder/admin. The `CloudSession` object stores the role after login.

---

## 4. Project Structure

```
lifetap/
├── App.tsx                     Root: ErrorBoundary > AppProvider > Navigation
├── index.js                    RN entry point (AppRegistry)
├── app.json                    { name: "lifetap", displayName: "LifeTap" }
├── package.json
├── .env                        SUPABASE_URL, SUPABASE_ANON_KEY (gitignored)
├── .env.example
├── tailwind.config.js
├── global.css                  NativeWind entrypoint
├── assets/                     App icons, logos, tab icons
├── android/                    Android native project
├── ios/                        iOS native project
├── supabase/
│   ├── config.toml             Project ref: uwkjvnutpmnqvfctiwjy
│   └── functions/
│       └── send-sms/           Deno Edge Function — Twilio SMS dispatch
└── src/
    ├── components/             Shared UI components
    ├── context/                AppContext (global state)
    ├── lib/                    Supabase client
    ├── navigation/             All navigators + CustomTabBar
    ├── screens/                All screens + overlays
    ├── services/               NFC, reports sync, SMS
    ├── storage/                AsyncStorage abstraction layer
    └── types/                  Shared TypeScript types
```

---

## 5. Navigation Architecture

React Navigation with a `Stack.Navigator` at the root. The `Main` screen renders either civilian or responder tabs based on role.

### Root Stack

| Screen | Component | Presentation |
|--------|-----------|--------------|
| `Main` | `TabNavigator` or `ResponderTabNavigator` | Default |
| `ReadNFC` | `ReadNFCOverlay` | `containedTransparentModal`, no anim |
| `WriteNFC` | `WriteNFCOverlay` | `containedTransparentModal`, no anim |
| `SyncOverlay` | `SyncOverlay` | `containedTransparentModal`, no anim |
| `Success` | `SuccessOverlay` | `containedTransparentModal`, no anim |
| `NFCResult` | `NFCResultScreen` | `containedTransparentModal`, no anim |
| `NewReport` | `NewReportScreen` | Default stack |
| `ReportDetail` | `ReportDetailScreen` | Default stack |

### Civilian Tabs (`TabNavigator`) — initial: `Home`

| Tab | Screen |
|-----|--------|
| Profile | `ProfileScreen` |
| Home | `HomeScreen` |
| Settings | `SettingsScreen` (aka AccountScreen) |

### Responder Tabs (`ResponderTabNavigator`) — initial: `Scan`

| Tab | Screen |
|-----|--------|
| Reports | `ReportsScreen` |
| Scan | `ScanScreen` |
| Settings | `ResponderSettingsScreen` |

**Custom tab bar:** Both navigators share a `CustomTabBar` component — a spring-animated pill bar with a sliding teal indicator. Defined in `src/navigation/index.tsx`.

---

## 6. Screens

### Civilian Screens

#### `HomeScreen` (`src/screens/HomeScreen.tsx`)
- Animated radial scanner UI (ping rings, orbiting dots, breathing gradient button)
- Central button → `ReadNFC`
- Secondary cards: "Write to Tag" → `WriteNFC`, "Sync Cloud" → `SyncOverlay` (or Settings if not logged in)
- Sync status banner if profile is out of sync, with contextual action button
- Reads `getSyncStatus()`, `getLocalUser()`, `getCloudSession()` on every focus

#### `ProfileScreen` (`src/screens/ProfileScreen.tsx`)
A state machine with `ScreenState`: `loading | gate | onboarding | existing_account | profile`

- **GateScreen** — choose "New user" or "I have an account"
- **ExistingAccountScreen** — OTP login to restore a cloud profile (steps: `phone | otp | loading | restoring`)
- **OnboardingFlow** — 5-step wizard: Personal Info → Address → Medical → Next of Kin → Privacy
- **ProfileView** — display + edit mode using the same 5 steps; includes Emergency ID modal showing a QR-style card view
- All profile data saves locally first; cloud sync is explicit (via SyncOverlay or upload button)

**Onboarding steps:**
1. `StepPersonal` — Name, DOB, blood type, organ donor toggle
2. `StepAddress` — Barangay, city
3. `StepMedical` — Allergies, conditions, medications (chip input)
4. `StepKin` — Next of kin entries (name + phone + relationship)
5. `StepPrivacy` — Consent to data collection; sets `is_public` toggle

#### `SettingsScreen` (`src/screens/SettingsScreen.tsx`)
- Cloud account card (shows session info or `LoginSheet` if not logged in)
- **LoginSheet** sub-component: phone → OTP → success → `refreshSession()`
- Security section: App Lock toggle (UI only; biometric implementation pending)
- Clear Local Data with double-confirmation
- Sign out: clears `CloudSession` + `supabase.auth.signOut()`

#### `NFCResultScreen` (`src/screens/NFCResultScreen.tsx`)
Shared screen for both roles. Route params: `{ data, fromReport?, viewOnly? }`

- **Responders** see full profile: blood type, allergies, conditions, medications, next of kin
- **Civilians** see restricted view + 911 CTA (unless `data.is_public === true`)
- On mount (responder + active report + not `viewOnly`): auto-adds victim to active report via `addVictimToReport()`
- SMS alert bottom sheet: "Send Alert" → `sendVictimAlert()` → Edge Function
- Next of kin phone numbers are tappable (opens dialer via `Linking`)

### NFC Overlay Screens

Overlays use `containedTransparentModal` presentation so the underlying tab screen remains visible behind them.

#### `ReadNFC` (`src/screens/overlays/ReadNFC.tsx`)
- Shows `NFCStatusPill` "Ready to scan" while waiting for tag
- On success: `navigation.replace('NFCResult', { data, fromReport })`
- On parse failure: `NFCSheet` with "Unrecognized tag" error + "Try Again" button
- On NFC error: `NFCSheet` with generic error

#### `WriteNFC` (`src/screens/overlays/WriteNFC.tsx`)
State machine: `confirm | scanning | success | error`
- **ConfirmStep**: preview of all data about to be written (identity, medical, kin, privacy)
- Calls `writeNfcTag()`, then `markSyncedToTag()` on success
- On success: transitions to `ResultStep` (in-screen success, not the shared Success overlay)

#### `SyncOverlay` (`src/screens/overlays/Sync.tsx`)
State machine: `comparing | in_sync | local_newer | cloud_newer | uploading | pulling | success | error`
- Compares `localUser.lastModified` vs Supabase `users.updated_at` (5-second tolerance to avoid false conflicts)
- **Upload path:** upserts to `users` table with `owner_id`; handles ID collision (adopts existing cloud `id`)
- **Pull path:** overwrites local from cloud record, calls `overwriteLocalUserFromCloud()`
- Shows a diff card with timestamps when there's a conflict choice

#### `Success` (`src/screens/overlays/Success.tsx`)
Generic success modal. Params: `{ message, subMessage? }`.

### Responder Screens

#### `ScanScreen` (`src/screens/responder/ScanScreen.tsx`)
- Header: responder name + organization
- Active report banner with STOP button; or "Start new report" prompt
- Large gradient scan button → `ReadNFC` (with `fromReport: true` if report active)
- Shows last 5 victims scanned in the active report

#### `ReportsScreen` (`src/screens/responder/ReportsScreen.tsx`)
- Active report shown at top with red highlight
- Past reports sorted by `createdAt` descending
- "+ New" → `NewReport`; row tap → `ReportDetail`

#### `NewReportScreen` (`src/screens/responder/NewReportScreen.tsx`)
- Fields: Report Name, Location (pre-filled from `responderProfile.city`), Date (defaults to today)
- If an active report exists: shows a warning ("you already have an active report") — user must confirm replacement
- On submit: `createReport()` from AppContext → navigates to Scan tab

#### `ReportDetailScreen` (`src/screens/responder/ReportDetailScreen.tsx`)
- Report metadata + victim list
- "Set as Active" button (if not currently active)
- "Sync to Cloud" button (if `!syncedToCloud`) → calls `syncReportToCloud()` directly
- Victim row tap → `NFCResult` with `viewOnly: true` and reconstructed victim data

#### `ResponderSettingsScreen` (`src/screens/responder/SettingsScreen.tsx`)
- Displays personnel profile: name, role, phone, badge number, organization, city
- Shows active report info with option to stop it
- Sign out button

---

## 7. Components

| Component | File | Description |
|-----------|------|-------------|
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | Class component wrapping the entire app |
| `NFCStatusPill` | `src/components/NFCStatusPill.tsx` | Animated top-of-screen pill shown during NFC operations (forwardRef → `NFCStatusPillRef`) |
| `NFCSheet` | `src/components/NFCsheet.tsx` | Slide-up bottom sheet for NFC errors/results (forwardRef → `NFCSheetRef`) with animated backdrop |
| `RippleRing` | `src/components/NFCanimations.tsx` | Expanding circle animation used in sync/cloud UIs |
| `BouncingDot` | `src/components/NFCanimations.tsx` | Pulsing dot used in loading states |
| `CustomTabBar` | `src/navigation/index.tsx` | Spring-animated sliding pill tab bar (shared by both navigators) |

---

## 8. State Management

**Approach: React Context + direct storage reads. No Redux, Zustand, or MobX.**

### `AppContext` (`src/context/AppContext.tsx`)

Single global context. Every screen that needs role/session data reads from here.

**State:**

| Field | Type | Description |
|-------|------|-------------|
| `role` | `UserRole` | Current user's role (`null` while loading) |
| `responderProfile` | `ResponderProfile \| null` | Personnel details (null for civilians) |
| `activeReport` | `Report \| null` | The currently active disaster report |
| `isLoading` | `boolean` | True while reading initial session from storage |

**Methods:**

| Method | Description |
|--------|-------------|
| `refreshSession()` | Re-reads `CloudSession` from EncryptedStorage; updates role + profile |
| `setActiveReport(report)` | Persists and sets active report |
| `deactivateReport()` | Clears active report from state + storage |
| `createReport(name, location, date)` | Creates, persists, and activates a new `Report` |
| `getAllReports()` | Returns all reports from storage |
| `addVictimToReport(reportId, victim)` | Appends a `ReportEntry` to a report |

**Background sync:** On app foreground (`AppState.addEventListener`) and on mount, if `isPersonnel`, silently calls `syncAllUnsyncedReports()`. A `syncingRef` prevents concurrent runs.

**Token sync:** Subscribes to `supabase.auth.onAuthStateChange`. On `TOKEN_REFRESHED`/`SIGNED_IN`, calls `updateCloudSessionTokens()` to keep `EncryptedStorage` in sync with Supabase's internal token refresh.

---

## 9. Storage Layer

**File:** `src/storage/asyncStorage.ts`

Two backends:

| Backend | Used For |
|---------|----------|
| `react-native-encrypted-storage` | Sensitive data: user profile, cloud session, reports |
| `@react-native-async-storage/async-storage` | Non-sensitive app settings; Supabase auth session |

### Storage Keys

| Key | Backend | Type |
|-----|---------|------|
| `lifetap:user_profile` | Encrypted | `LocalUser` |
| `lifetap:cloud_session` | Encrypted | `CloudSession` |
| `lifetap:personnel_session` | Encrypted | `PersonnelSession` (legacy) |
| `lifetap:app_settings` | AsyncStorage | `AppSettings` |
| `@lifetap_reports` | Encrypted | `Report[]` |
| `@lifetap_active_report` | Encrypted | `Report` |

### Types

**`LocalUser`** — Full device-side profile

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Format: `lt-<ts36>-<rand4>` — matches `users.id` in Supabase |
| `n` | string | Full name |
| `dob` | string | Date of birth (ISO) |
| `bt` | string | Blood type |
| `brg` | string | Barangay |
| `cty` | string | City |
| `phn` | string | Phone number |
| `rel` | string | Religion |
| `od` | boolean | Organ donor |
| `is_public` | boolean | Whether non-personnel can see full profile after scan |
| `a` | string[] | Allergies |
| `c` | string[] | Conditions |
| `meds` | string[] | Medications |
| `kin` | Kin[] | Next of kin: `{ n, p, r }` (name, phone, relationship) |
| `lastModified` | string | ISO timestamp — used for cloud sync comparison |
| `syncedToTag` | boolean | Whether NFC tag is up to date |
| `syncedToCloud` | boolean | Whether cloud record is up to date |

**`CloudSession`** — Stored after login; includes Supabase tokens + role fields

**`PersonnelSession`** — Legacy; largely superseded by `CloudSession`

**`AppSettings`** — `{ appLockEnabled, lockMethod, onboardingComplete }`

**`SyncStatus`** — `'IN_SYNC' | 'TAG_BEHIND' | 'CLOUD_BEHIND' | 'NOT_SYNCED'`

### Exported Functions

**Cloud Session:** `getCloudSession`, `saveCloudSession`, `clearCloudSession`, `updateCloudSessionTokens`, `isLoggedIn`, `isPersonnel`

**User Profile:** `getLocalUser`, `saveLocalUser`, `updateLocalUser`, `markSyncedToTag`, `markSyncedToCloud`, `overwriteLocalUserFromCloud`, `clearLocalUser`

**App Settings:** `getAppSettings`, `updateAppSettings`

**Sync Status:** `getSyncStatus`

**Reports:** `getAllReports`, `getReportById`, `saveReport`, `updateReport`, `deleteReport`, `getActiveReport`, `setActiveReport`, `addEntryToReport`, `markReportSynced`

---

## 10. NFC Implementation

**File:** `src/services/nfc.ts`  
**Library:** `react-native-nfc-manager` v3.17.2  
**Tag format:** NDEF text record containing a JSON-serialised `LocalUser`

### Functions

| Function | Description |
|----------|-------------|
| `initNfc()` | Called once in `App.tsx`. Checks `isSupported()` and calls `NfcManager.start()` |
| `readNfcTag()` | Requests `NfcTech.Ndef`, reads first NDEF record, decodes text payload, JSON-parses it. Throws `UNRECOGNIZED_TAG` if parse fails |
| `writeNfcTag(data)` | JSON-stringifies data, encodes as `Ndef.textRecord`, writes via `NfcManager.ndefHandler.writeNdefMessage()` |
| `cancelNfc()` | Calls `NfcManager.cancelTechnologyRequest()` silently — called on overlay dismiss |

### What Goes on the Tag

The tag holds a single JSON text record with the full `LocalUser` minus sync metadata (`syncedToTag`, `syncedToCloud`). Short column names (`n`, `bt`, `brg`, etc.) are used to minimize NDEF payload size (~1KB limit on most tags).

### Privacy on Tag

The tag always contains full medical data — `is_public` is just a flag. `NFCResultScreen` reads this flag and the reader's role to decide what to display. Responders always see everything; civilians only see the name/blood type unless `is_public === true`.

---

## 11. Services

### NFC (`src/services/nfc.ts`)
See Section 10.

### Reports Sync (`src/services/reports.ts`)

| Function | Description |
|----------|-------------|
| `syncReportToCloud(report)` | Upserts a single report to Supabase `reports` table, then calls `markReportSynced()` |
| `syncAllUnsyncedReports()` | Gets all reports, filters `!syncedToCloud`, calls `syncReportToCloud()` on each |

Called automatically on app foreground (via `AppContext`) and manually from `ReportDetailScreen`.

### SMS (`src/services/sms.ts`)

| Function | Description |
|----------|-------------|
| `sendVictimAlert(victim, location, responderName, session)` | Calls Supabase Edge Function `send-sms` with victim name, kin phone numbers, location, responder name, and time |

The Edge Function (`supabase/functions/send-sms/`) uses Twilio to send parallel SMS messages to all kin numbers. Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets set in the Supabase project.

---

## 12. Supabase Integration

**File:** `src/lib/supabase.ts`

```typescript
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

Env vars come from `react-native-config` (reads `.env` file).

### Tables Used

**`users`** — Civilian medical profiles
- `id` format: `lt-<ts36>-<rand4>` (text PK, not UUID — chosen to allow pre-generation before cloud exists)
- `owner_id`: Supabase auth UUID, unique constraint — links the profile to an auth account
- Upserted from `SyncOverlay` when civilian uploads
- RLS: civilians can only read/write their own row (matched via `owner_id`)

**`personnel`** — Staff accounts
- Queried at login to determine role
- Columns used: `full_name`, `role`, `city`, `badge_no`, `organization`, `phone`, `is_active`
- Managed entirely from the admin dashboard — the app only reads this table

**`reports`** — Disaster reports
- PK: text `id` (format same as `users.id`)
- `entries`: JSONB array of `ReportEntry` objects
- Upserted from the app via `syncReportToCloud()`
- Readable in the admin dashboard at `/dashboard/reports`

---

## 13. Authentication Flow

### Login (both roles)

```
1. User enters +639XXXXXXXXX phone number
2. supabase.auth.signInWithOtp({ phone }) → Supabase sends OTP via SMS
3. supabase.auth.verifyOtp({ phone, token, type: 'sms' }) → session returned
4. App queries personnel table WHERE phone = normalized phone
5. If personnel record found (is_active = true):
   → constructs CloudSession with role + personnel fields
   → saves to EncryptedStorage
   → AppContext.refreshSession() re-reads → ResponderTabNavigator shown
6. If no personnel record:
   → role = 'civilian', CloudSession saved without personnel fields
   → TabNavigator stays (civilian mode)
```

### Session Persistence

- Supabase session is kept in `AsyncStorage` by the Supabase client itself (persistent, auto-refreshed)
- `CloudSession` in `EncryptedStorage` mirrors the tokens + adds role fields
- `AppContext.onAuthStateChange` listener catches `TOKEN_REFRESHED` and syncs the `EncryptedStorage` copy

### Sign Out

1. `clearCloudSession()` — removes from EncryptedStorage
2. `supabase.auth.signOut()` — invalidates session
3. `deactivateReport()` — prevents active report from leaking to next session
4. `refreshSession()` — updates AppContext → navigators re-render, role → null

---

## 14. Data Flows

### NFC Write (Civilian)

```
Civilian completes profile in ProfileScreen
    ↓
Taps "Write to Tag" on HomeScreen → WriteNFC overlay
    ↓
ConfirmStep shows preview of what will be written
    ↓
writeNfcTag(localUser) — JSON → NDEF text record → NFC tag
    ↓
markSyncedToTag() updates LocalUser.syncedToTag = true + lastModified
    ↓
HomeScreen sync banner clears (or shows cloud-behind if cloud is stale)
```

### NFC Scan (Responder)

```
Responder opens ScanScreen → taps scan button
    ↓
ReadNFC overlay: initNfc (if needed) → readNfcTag()
    ↓
NDEF payload decoded → JSON-parsed → LocalUser-shaped object
    ↓
navigation.replace('NFCResult', { data, fromReport: true })
    ↓
NFCResultScreen mounts:
  - If active report: addVictimToReport(activeReport.id, entry)
  - Displays full medical profile (responder sees everything)
  - "Send Alert" button → sendVictimAlert() → send-sms Edge Function
    ↓
Responder goes back → continues scanning
    ↓
On app foreground: syncAllUnsyncedReports() runs silently
    ↓
Report appears in admin dashboard at /dashboard/reports
```

### Cloud Sync (Civilian)

```
Civilian taps "Sync Cloud" → SyncOverlay
    ↓
SyncOverlay fetches cloud record from users table
    ↓
Compares localUser.lastModified vs users.updated_at (5-sec tolerance)
    ↓
  If local newer → show diff card → user confirms Upload
  If cloud newer → show diff card → user confirms Pull
  If equal → "Already in sync" state
    ↓
Upload path: supabase.from('users').upsert({ ...localUser, owner_id })
  - Handles id collision: if cloud has a different id for this owner, adopts it
Pull path: overwriteLocalUserFromCloud(cloudRecord)
    ↓
markSyncedToCloud() updates LocalUser.syncedToCloud = true
```

---

## 15. Types Reference

### `src/types/responder.ts`

```typescript
type UserRole = 'civilian' | 'medic' | 'responder' | 'admin' | null

type ResponderProfile = {
  phone: string
  full_name: string
  role: UserRole
  city: string
  badge_no?: string
  organization?: string
}

type ReportEntry = {
  id: string
  n: string           // victim name
  bt: string          // blood type
  dob: string
  a: string[]         // allergies
  c: string[]         // conditions
  meds: string[]
  kin: Kin[]
  scannedAt: string   // ISO timestamp
  smsSent: boolean
}

type Report = {
  id: string
  name: string
  date: string
  location: string
  responderName: string
  responderPhone: string
  city: string
  isActive: boolean
  entries: ReportEntry[]
  createdAt: string
  syncedToCloud: boolean
}
```

### `src/navigation/types.ts`

```typescript
type RootStackParamList = {
  Main: undefined
  ReadNFC: { fromReport?: boolean }
  WriteNFC: undefined
  SyncOverlay: undefined
  Success: { message: string; subMessage?: string }
  NFCResult: { data: LocalUser; fromReport?: boolean; viewOnly?: boolean }
  NewReport: undefined
  ReportDetail: { reportId: string }
}
```

---

## 16. Key Files Reference

```
App.tsx                         Root: ErrorBoundary > AppProvider > Navigation
index.js                        RN entry point

src/
  context/
    AppContext.tsx               Global state: role, responderProfile, activeReport
  lib/
    supabase.ts                 Supabase client singleton (with AsyncStorage adapter)
  navigation/
    index.tsx                   All navigators + CustomTabBar
    types.ts                    RootStackParamList, TabParamList, ResponderTabParamList
  screens/
    HomeScreen.tsx              Civilian home: scan button + sync cards
    NFCResultScreen.tsx         Post-scan profile display (shared civilian + responder)
    ProfileScreen.tsx           Civilian profile: onboarding wizard + profile view/edit
    SettingsScreen.tsx          Civilian account: login sheet, app lock, clear data
    overlays/
      ReadNFC.tsx               NFC read flow overlay
      WriteNFC.tsx              NFC write flow overlay
      Sync.tsx                  Cloud sync overlay (compare + upload/pull)
      Success.tsx               Generic success modal
    responder/
      ScanScreen.tsx            Responder home: active report banner + scan CTA
      ReportsScreen.tsx         All reports list
      NewReportScreen.tsx       Create a disaster report
      ReportDetailScreen.tsx    Report detail: victims + sync + set active
      SettingsScreen.tsx        Responder profile + sign out
  services/
    nfc.ts                      initNfc, readNfcTag, writeNfcTag, cancelNfc
    reports.ts                  syncReportToCloud, syncAllUnsyncedReports
    sms.ts                      sendVictimAlert (calls send-sms Edge Function)
  storage/
    asyncStorage.ts             All local persistence — types + all CRUD functions
  components/
    ErrorBoundary.tsx
    NFCStatusPill.tsx
    NFCanimations.tsx           RippleRing, BouncingDot
    NFCsheet.tsx                Slide-up bottom sheet
  types/
    responder.ts                UserRole, ResponderProfile, ReportEntry, Report

supabase/
  functions/
    send-sms/index.ts           Deno Edge Function — Twilio SMS to next of kin
```

---

## 17. Environment Variables

Set in `.env` (read via `react-native-config`):

| Variable | Used In |
|----------|---------|
| `SUPABASE_URL` | `src/lib/supabase.ts` |
| `SUPABASE_ANON_KEY` | `src/lib/supabase.ts` |

Edge Function secrets (set in Supabase dashboard, not `.env`):

| Secret | Used In |
|--------|---------|
| `TWILIO_ACCOUNT_SID` | `supabase/functions/send-sms/` |
| `TWILIO_AUTH_TOKEN` | `supabase/functions/send-sms/` |
| `TWILIO_PHONE_NUMBER` | `supabase/functions/send-sms/` |

---

## 18. Known Gaps & Future Work

### High Priority
- **QR code fallback** — If a civilian loses their NFC tag, responders have no backup access. A per-civilian QR code (printable from the app) linking to a public `/e/[id]` route on the dashboard would close this gap. `is_public` flag already supports controlled public access.
- **Session re-auth prompt** — When the Supabase session expires mid-use in the field, the app silently fails cloud operations. It should detect the expired state and prompt for OTP re-auth rather than failing quietly.
- **Biometric app lock** — The App Lock toggle in Settings exists in the UI but biometric (`react-native-biometrics`) and PIN entry are not yet implemented.

### Medium Priority
- **Consent re-obtainment flow** — When the privacy notice version changes, the app should detect the mismatch between `consent_version` on the local profile and the current version, and prompt civilians to re-accept before write/sync.
- **Report editing** — There is no way to remove a victim from a report or correct an entry after the scan. Entries are append-only.
- **Offline indicator** — The app has no UI indication of connectivity state. Users in the field may not know a sync is pending.
- **Android NFC behavior parity** — NFC behavior varies by OEM. ReadNFC and WriteNFC flows should be tested on Samsung, Xiaomi, and other common Philippine market devices.

### Lower Priority
- **Pagination for reports list** — `ReportsScreen` loads all reports from storage. For active responders with many reports over time, this will degrade.
- **Export report to PDF** — Responders sometimes need a printable incident summary for inter-agency coordination.
- **Push notifications** — Notify responders when a new report sync is confirmed, or when an admin deactivates their account.
- **Personnel self-edit** — Responders cannot update their own organization or badge number from the app. Only dashboard admins can edit this.

### Deployment Checklist (before go-live)
- [ ] Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` for each build target
- [ ] Set Twilio secrets in Supabase dashboard for the `send-sms` Edge Function
- [ ] Deploy `send-sms` Edge Function: `supabase functions deploy send-sms`
- [ ] Enable RLS on `users`, `personnel`, `reports` tables in Supabase dashboard
- [ ] Run all SQL migrations: `policies.sql` → `audit.sql` → `consent.sql` → `users-active.sql`
- [ ] Set Supabase OTP rate limit (recommended: 5 per phone per hour)
- [ ] Test NFC write/read on target Android devices (behavior varies by OEM)
- [ ] Test OTP SMS delivery on Philippine carriers (Globe, Smart, DITO)
- [ ] Build release APK/IPA and test on physical devices — NFC does not work in simulators
