# LifeTap Mobile App — Full System Reference

> Last updated: 2026-05-13  
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
├── assets/                     App icons, logos, tab icons (keep each PNG at
│                               ~3x its on-screen size — full-resolution art
│                               belongs in assets/originals/, not in a screen:
│                               iOS re-decodes images over 2 MB decoded on
│                               every tab switch, which visibly stalls the UI)
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
- Animated radial scanner UI (ping rings, orbiting dots, breathing gradient button) from the shared `useScannerAnimation()` hook (`src/hooks/useScannerAnimation.ts`, also used by the responder Scan screen). The loops run from mount until unmount, and are skipped entirely under Reduce Motion — pausing them on blur and restarting them on focus made tab switches stutter
- Central button → `ReadNFC`
- Secondary cards: "Write to Tag" → `WriteNFC`, "Sync Cloud" → `SyncOverlay` (or Settings if not logged in)
- Sync status banner if profile is out of sync, with contextual action button
- Reads `getSyncStatus()`, `getLocalUser()`, `getCloudSession()` on every focus

#### `ProfileScreen` (`src/screens/ProfileScreen.tsx`)
A state machine with `ScreenState`: `loading | gate | onboarding | existing_account | consent_required | profile`

- **GateScreen** — choose "New user" or "I have an account"
- **ExistingAccountScreen** — restores a cloud profile by `owner_id` (steps: `checking | signed_in | phone | otp | loading | restoring | restore_failed`). Already signed in (e.g. from Settings) → offers to restore that account without another OTP, or "Use a different number". Otherwise OTP login, showing `SignInNotice` before sending the code. A failed lookup goes to `restore_failed` (Try Again) — never to "No Profile Found", which would lead to onboarding a new profile that overwrites the real backup. Restores via `profileFromCloudRow()` (consent included)
- **OnboardingFlow** — 6-step wizard: **Consent** → Personal Info → Address → Medical → Next of Kin → Privacy. Nothing is saved until consent is given
- **ConsentGate** (`consent_required`) — shown instead of the profile when `!hasCurrentConsent(user)` (profiles from before the consent flow, or that accepted an older notice version). Accepting goes through `updateLocalUser`, so the tag and cloud are marked out of date
- **ProfileView** — display + edit mode using 5 steps (no consent step — consent is managed in Settings); includes Emergency ID modal showing a QR-style card view
- All profile data saves locally first; cloud sync is explicit (via SyncOverlay or upload button)

Steps are keyed (`StepKey`): `ONBOARDING_STEPS` / `EDIT_STEPS`, validated by `validateStep(key, form, ctx)`.

**Onboarding steps:**
1. `StepConsent` — `ConsentForm`: layered notice summary + full notice link, who is consenting (self 18+ / parent-guardian with name + relationship), required core consent, optional SMS-alerts consent
2. `StepPersonal` — Name, DOB, blood type, religion (with a sensitive-information note), organ donor. A DOB under 18 without guardian consent is rejected
3. `StepAddress` — Barangay, city
4. `StepMedical` — Allergies, conditions, medications (chip input)
5. `StepKin` — Next of kin entries (name + phone + relationship); if any are listed, a required "these people agreed to be listed" confirmation
6. `StepPrivacy` — Sets `is_public` toggle; notes that the tag is not yet encrypted

#### `SettingsScreen` (`src/screens/SettingsScreen.tsx`)
- Cloud account card (shows session info or `LoginSheet` if not logged in)
- **LoginSheet** sub-component: phone → OTP → success → `refreshSession()`; shows `SignInNotice` (account is created automatically; upload only if backup is chosen)
- **Privacy & Consent** section: privacy notice (`PrivacyNoticeModal`), "Your consent" summary → `ConsentModal` to change who consented / SMS alerts, **Download a copy of my data** (share sheet, JSON), **Erase my LifeTap tag** (`WriteNFC` with `mode: 'erase'`), **Withdraw consent & delete my data** (`eraseEverything()` — cloud account via `delete-account` if signed in + local profile — then offers to erase the tag, passing the deleted profile's id as `ownId`; **Delete Account** does the same), Data Protection Officer contact. Tag status here and on the Profile screen uses `isTagCurrent()` — the same check as Home — so a plaintext or rotated-key tag never shows as "Synced". About shows `package.json`'s `version`
- App Lock is **hidden** until biometric/PIN unlock is implemented (a toggle that protected nothing was misleading); `AppSettings` still stores the fields
- **Delete Account** — triple-confirmation dialog chain; calls `supabase.functions.invoke('delete-account')` with the user's access token, then clears local session and profile. Only shown when logged in.
- Clear Local Data with double-confirmation
- Sign out: clears `CloudSession` + `supabase.auth.signOut()`

#### `NFCResultScreen` (`src/screens/NFCResultScreen.tsx`)
Shared screen for both roles. Route params: `{ data, fromReport?, viewOnly? }`

- `fromReport` is a report **name string** (shown in the banner), not a boolean
- `viewOnly: true` skips the auto-add (used when navigating from `ReportDetailScreen`)
- **Responders** see full profile: blood type, allergies, conditions, medications, next of kin
- **Civilians** scanning a private tag see **name + blood type only**, a "Profile Restricted" card, first-aid guidance and a 911 CTA. With `data.is_public === true` they see the full profile. (This matches the text on the Privacy step and write confirmation.)
- On mount (responder + active report + not `viewOnly`): auto-adds victim via `addVictimToReport()` with a `tagId` for dedup; shows teal "Added to {report}" banner, or amber "Already in {report}" if the tag was already scanned
- SMS alert bottom sheet: "Send Alert" → `sendVictimAlert(entry, location)` → Edge Function; marks `smsSent` on the entry in storage. Only shown when the tag's `sms` flag is true (the person's consent); otherwise responders see "chose not to allow SMS alerts — call instead"
- Next of kin and personal phone numbers are tappable (opens dialer via `Linking`)

### NFC Overlay Screens

Overlays use `containedTransparentModal` presentation so the underlying tab screen remains visible behind them.

#### `ReadNFC` (`src/screens/overlays/ReadNFC.tsx`)
- Shows `NFCStatusPill` "Ready to scan" while waiting for tag
- On success: `navigation.replace('NFCResult', { data })` — `data` is a validated `TagProfile`
- On parse failure / non-LifeTap tag: `NFCSheet` with "Unrecognized tag" error + "Try Again" button
- On NFC error: `NFCSheet` with generic error
- On cancel (our ✕ or the iOS system sheet): closes quietly, no error sheet

#### `WriteNFC` (`src/screens/overlays/WriteNFC.tsx`)
Route params: `{ mode?: 'write' | 'erase'; ownId?: string }` (`ownId`: the tag's owner when the profile was already deleted, so the user's own tag isn't flagged as someone else's). State machine: `loading | confirm | scanning | overwrite | success | error`
- **ConfirmStep** (write): preview of all data about to be written (identity, medical, kin, privacy, SMS-alert choice)
- Refuses to write (`NeedsConsentStep`) until the profile has current consent
- Calls `writeNfcTag()` (payload includes `sms: consent.smsAlerts`), then `markSyncedToTag()` on success
- **Erase mode**: `ConfirmEraseStep` → `eraseNfcTag()`; works without a local profile (used after withdrawing consent)
- **Overwrite prompt** (`overwrite`): the tag holds a different LifeTap id or another app's data. Offers **Replace It / Erase Anyway** (retries with `force`), **Use a Different Tag** (back to `confirm`, keeping route params such as `ownId`) and Cancel. With no profile on the phone and no `ownId`, a LifeTap tag is described as "This tag holds a LifeTap profile… make sure the tag is yours" rather than "someone else's" — the app deliberately doesn't remember a deleted profile's id
- On success: transitions to `ResultStep` (in-screen success, not the shared Success overlay)

#### `SyncOverlay` (`src/screens/overlays/Sync.tsx`)
State machine: `needs_consent | comparing | in_sync | local_newer | cloud_newer | different_profile | uploading | pulling | success | error`
- `needs_consent` if the profile lacks current consent
- Looks up **the account's** cloud row (`owner_id` = signed-in user), not a row with this phone's profile id. No row → `local_newer` ("No cloud record"). A row with a different `id` → `different_profile`: shows both names and timestamps and makes the user choose "Use the Cloud Profile" (pull) or "Replace It With This Phone's" (upload); nothing is replaced silently
- Same id: compares `localUser.lastModified` vs `users.updated_at` (5-second tolerance to avoid false conflicts)
- **Upload path:** first upload asks **just-in-time cloud-backup consent** (required checkbox, discloses Sydney hosting and dashboard access), recorded with `saveConsentOnly()`; upserts `cloudRowFromProfile()` (profile + `owner_id` + `consent_given_at` / `consent_version` / `consent_details`); handles ID collision (adopts existing cloud `id`)
- **Pull path:** fetches by `owner_id`, `profileFromCloudRow()` → `overwriteLocalUserFromCloud()` (takes the cloud row's id), keeping whichever consent record is newer
- Shows a diff card with timestamps when there's a conflict choice

#### `Success` (`src/screens/overlays/Success.tsx`)
Generic success modal. Params: `{ message, subMessage? }`.

### Responder Screens

#### `ScanScreen` (`src/screens/responder/ScanScreen.tsx`)
- Header: responder name + organization
- Active report banner with STOP button; or "Start new report" prompt
- Large gradient scan button → `ReadNFC` (the result screen adds the victim to the active report itself)
- Shows last 5 victims scanned in the active report

#### `ReportsScreen` (`src/screens/responder/ReportsScreen.tsx`)
- Active report shown at top with red highlight
- Past reports sorted by `createdAt` descending
- "+ New" → `NewReport`; row tap → `ReportDetail`

#### `NewReportScreen` (`src/screens/responder/NewReportScreen.tsx`)
- Fields: Report Name, Location (pre-filled from `responderProfile.city`), Date (plain text input, defaults to today as `YYYY-MM-DD`)
- If an active report exists: shows an amber warning banner + confirmation dialog before replacing
- On submit: `createReport()` from AppContext → navigates to Scan tab
- Shows a responder info card (name + organization) below the fields

#### `ReportDetailScreen` (`src/screens/responder/ReportDetailScreen.tsx`)
- Report metadata + victim list; shows ACTIVE / LOCAL / SYNCED badges
- "Set as Active" button (if not currently active)
- "Sync to Cloud" button (if `!syncedToCloud`) → calls `syncReportToCloud()` directly; shows loading indicator
- Victim row shows blood type, name, `formatTime(scannedAt)` (Unix ms → locale string), and `✓ SMS sent` if sent
- Victim row tap → `NFCResult` with `viewOnly: true`, `fromReport: report.name` (shown as a neutral "Record from …" banner), and reconstructed victim data (`id: entry.tagId || entry.id`, `is_public: true`; fields not in `ReportEntry` are empty and render as "—")

#### `ResponderSettingsScreen` (`src/screens/responder/SettingsScreen.tsx`)
- Profile header card (initials avatar, name, role)
- Personnel info card: phone, badge number, organization, city
- Active report card (if active): shows name, victim count, location + STOP REPORT button
- Sign out: `supabase.auth.signOut()` → `clearCloudSession()` → `refreshSession()` (drops back to civilian mode; active report is NOT automatically deactivated on sign-out)

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
| `ConsentForm` | `src/components/ConsentForm.tsx` | Layered notice + who-consents + purpose checkboxes; exports `ConsentDraft`, `draftFromRecord`, `validateConsentDraft`, `recordFromDraft` |
| `ConsentCheckbox` | `src/components/ConsentCheckbox.tsx` | Unticked-by-default checkbox with Required/Optional label |
| `PrivacyNoticeModal` | `src/components/PrivacyNoticeModal.tsx` | Full notice viewer (shows "Draft" label while `NOTICE_IS_DRAFT`) |
| `SignInNotice` | `src/components/SignInNotice.tsx` | Just-in-time note before OTP sign-in |
| `UndertakingScreen` | `src/screens/responder/UndertakingScreen.tsx` | Responder confidentiality undertaking; Navigation shows it instead of the responder tabs until the current `RESPONDER_UNDERTAKING_VERSION` is accepted by this account |

### Data Privacy Act consent

- **Notice text:** `src/legal/privacyNotice.ts` — `PRIVACY_NOTICE_VERSION`, `NOTICE_SUMMARY` (first layer), `NOTICE_SECTIONS` (full notice), `RESPONDER_UNDERTAKING`, and `CONTROLLER` (ArchTech is the controller for the capstone pilot; the university DPO is the escalation point; pilot data is deleted within 30 days of the defense). Bump the version on material changes → every user is sent through `ConsentGate` again.
- **Record:** `LocalUser.consent: ConsentRecord` — `{ version, acceptedAt, updatedAt, smsAlerts, cloudBackup, cloudBackupAt, contactsConfirmed, guardian }`. `hasCurrentConsent(user)` gates tag writes, sync and the profile view.
- **Purposes:** core storage on phone + tag (required) · SMS alerts to contacts (optional, carried on the tag as `sms`) · cloud backup (optional, asked at first upload) · public profile (`is_public`, Privacy step).
- **Cloud:** `users.consent_given_at`, `consent_version` (shown in the dashboard), `consent_details` (jsonb of the choices).
- **Responder undertaking:** stored per account in `AppSettings.responderUndertakings`, and best-effort on `personnel.undertaking_accepted_at` / `undertaking_version`.

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
| `getAllReports()` | Returns the signed-in account's reports only (`isReportOwnedBy`) |
| `getReportById(id)` | Owner-filtered; another account's report returns `null` |

**Report ownership (shared devices):** every report stores `ownerId` (auth user id); older reports are matched by `responderPhone`. `refreshSession()` clears the active report whenever it isn't owned by the current session — so signing out (any path) or switching accounts never carries it over. Other accounts' reports stay on the device, hidden, and upload when their owner signs back in.
| `addVictimToReport(reportId, victim)` | Appends a `ReportEntry` to a report |

**Role:** derived with `activeRole(session)` — the stored personnel role, valid while `personnel_verified_at` is within `PERSONNEL_OFFLINE_GRACE_MS` (30 days). Access-token expiry does **not** affect the role, so responders keep responder mode offline.

**Personnel re-verification:** On mount and every app foreground (throttled to once a minute), `verifyPersonnel()` re-queries `personnel` via `lookupPersonnel()`. Found → role refreshed and re-stamped; not found → demoted to civilian; network error → cached role kept.

**Background sync:** On app foreground (`AppState.addEventListener`) and on mount, if `isPersonnel`, silently calls `syncAllUnsyncedReports(owner)` (current account's reports only). A `syncingRef` prevents concurrent runs.

**Token sync:** Subscribes to `supabase.auth.onAuthStateChange`. On `TOKEN_REFRESHED`/`SIGNED_IN`, calls `updateCloudSessionTokens()` to keep `EncryptedStorage` in sync with Supabase's internal token refresh.

---

## 9. Storage Layer

**File:** `src/storage/asyncStorage.ts`

Two backends:

| Backend | Used For |
|---------|----------|
| `react-native-encrypted-storage` | Sensitive data: user profile, cloud session, reports, Supabase auth session |
| `@react-native-async-storage/async-storage` | Non-sensitive app settings only |

### Storage Keys

| Key | Backend | Type |
|-----|---------|------|
| `lifetap:user_profile` | Encrypted | `LocalUser` |
| `lifetap:cloud_session` | Encrypted | `CloudSession` |
| `lifetap:personnel_session` | Encrypted | `PersonnelSession` (legacy) |
| `lifetap:app_settings` | AsyncStorage | `AppSettings` |
| `lifetap:report:<id>` | Encrypted | one `Report` (without `isActive`) |
| `lifetap:reports_index` | Encrypted | `string[]` of report ids |
| `lifetap:active_report_id` | Encrypted | active report id (`isActive` is derived on read) |
| `lifetap:responder_keys` | Encrypted | responder tag-key keyring `{ id: hex }` (personnel only) |
| `@lifetap_reports`, `@lifetap_active_report` | Encrypted | **legacy** single-blob layout — migrated once, then removed |

**Report storage:** one encrypted item per report, so a scan reads/writes a single report instead of re-encrypting every report (the old layout also kept a duplicate active copy that could go stale). All report writes run through one queue (`serialized`), so concurrent updates — a scan landing while a background upload finishes — can't overwrite each other. `markReportSynced(id, uploadedUpdatedAt)` only marks a report synced if its `updatedAt` hasn't changed since the upload started.

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
| `lastModified` | number | Unix timestamp (`Date.now()`) — used for cloud sync comparison |
| `syncedToTag` | boolean | Whether the last tag write succeeded. For display use `isTagCurrent()`, which also checks `tagFormat` and `tagKeyId` |
| `syncedToCloud` | boolean | Whether cloud record is up to date |

**`CloudSession`** — Stored after login; includes Supabase tokens + role fields

**`PersonnelSession`** — Legacy; largely superseded by `CloudSession`

**`AppSettings`** — `{ appLockEnabled, lockMethod, onboardingComplete }`

**`SyncStatus`** — `'IN_SYNC' | 'TAG_BEHIND' | 'CLOUD_BEHIND' | 'NOT_SYNCED'`

### Exported Functions

**Cloud Session:** `getCloudSession` (never returns null just because the access token expired), `saveCloudSession`, `clearCloudSession`, `updateCloudSessionTokens`, `updateCloudSessionPersonnel`, `activeRole`, `isLoggedIn`, `isPersonnel`

**User Profile:** `getLocalUser`, `saveLocalUser`, `updateLocalUser`, `markSyncedToTag`, `markSyncedToCloud`, `overwriteLocalUserFromCloud`, `clearLocalUser`

**App Settings:** `getAppSettings`, `updateAppSettings`

**Sync Status:** `getSyncStatus`

**Reports:** `getAllReports`, `getReportById`, `saveReport`, `updateReport`, `deleteReport`, `getActiveReport`, `setActiveReport`, `addEntryToReport` (deduplicates by `entry.tagId` — rescanning the same tag is a no-op), `updateReportEntry` (patches one entry in both the list and the active copy, marks for re-sync — used for `smsSent`), `markReportSynced`

---

## 10. NFC Implementation

**Files:** `src/services/nfc.ts` (app-facing), `src/crypto/tagFormat.ts` (payload encryption), `src/crypto/ntag.ts` (raw NTAG21x commands), `src/crypto/keys.ts` (key handling)  
**Libraries:** `react-native-nfc-manager` v3.17.2, `@noble/ciphers` / `@noble/curves` / `@noble/hashes` 2.4, `fflate`, `react-native-get-random-values` (imported first in `index.js`)  
**Tag format v2:** encrypted, write-protected; tags written by older builds (plain JSON text record) are still readable

### Functions

| Function | Description |
|----------|-------------|
| `initNfc()` | Called once in `App.tsx`. Checks `isSupported()` and calls `NfcManager.start()` |
| `readNfcTag()` | `NfcTech.Ndef` read. Finds the `application/vnd.lifetap` record and decrypts it with `getDecodeKeys()`; otherwise falls back to the legacy JSON text record. Returns a `TagProfile` (every field filled; `restricted` set if the responder section couldn't be opened), `null` on read failure; throws `UNRECOGNIZED_TAG` for empty/non-LifeTap tags and `NFC_CANCELLED` on user cancel |
| `parseTagPayload(raw)` | Accepts only objects with a non-empty `id` and `n`; coerces every other field to its type with safe defaults so screens never see `undefined` |
| `writeNfcTag(profile, { force? })` | Encrypts (`encodeTagPayload`), builds the NDEF message (lifetap record + plain hint text + Android app record), then in one raw NfcA/MIFARE session: identify NTAG21x → size check → PWD_AUTH if protected → overwrite check → tearing-safe write → enable write protection on first write. Returns `TagWriteResult` (`too_large`, `foreign`, `locked`, `unsupported`, `not_ndef`, `read_only`, `not_configured`, `failed`) |
| `eraseNfcTag({ ownId?, force? })` | Same session flow; writes a single empty record and removes LifeTap's write protection (hands the tag back) |
| `tagBytesNeeded(profile)` | Bytes the profile will take (size meter on the write confirmation; NTAG216 = 872) |
| `cancelNfc()` | Calls `NfcManager.cancelTechnologyRequest()` silently — called on overlay dismiss |

### What Goes on the Tag

One NDEF message with three records:
1. **`application/vnd.lifetap`** — binary payload, format v2 (`src/crypto/tagFormat.ts`):
   - **Section A** (AES-256-GCM, key derived from `TAG_APP_SECRET`): `{ id, n, bt, sms }` — or the **whole profile** when `is_public`. Readable by any LifeTap install.
   - **Section B** (X25519 + HKDF + AES-256-GCM, sealed to `TAG_RESPONDER_PUBLIC_KEY`): dob, address, phone, religion, organ donor, allergies, conditions, medications, kin. Only devices holding the responder private key (active personnel) can open it.
   - 6-byte authenticated header (version, flags, key ids, section A length); sections are deflate-compressed JSON.
2. **Text** — "LifeTap medical ID. Scan with the LifeTap app, or call 911." (what other NFC apps show)
3. **Android Application Record** (`com.lifetap`) — tapping a tag opens LifeTap on Android

Typical profile ≈ 544 B, heavy profile ≈ 705 B of NTAG216's 872 B (the old plain JSON was larger). An erased tag holds a single empty NDEF record, which reads as "Unrecognized tag".

### Tag protection (NTAG213/215/216)

- Write-protected from page 4 with the chip's 32-bit password (`PWD_AUTH`); **reading stays open** (responders must read offline — confidentiality comes from the encryption).
- Password + PACK are derived per tag: `HMAC(HKDF(app secret), tag UID)`, so a sniffed password unlocks only that tag.
- `AUTHLIM = 0` on purpose — a failed-attempt limit would let anyone permanently brick a tag's writes.
- Writes are tearing-safe (page 4 is written last), so a tag pulled away mid-write reads as empty, not corrupt.
- Before overwriting, the app reads the tag: another person's LifeTap profile or non-LifeTap data triggers a "Replace it?" confirmation (`foreign`), then a second tap with `force`.

### Keys

| Key | Where | Purpose |
|-----|-------|---------|
| `TAG_APP_SECRET` (+ `TAG_APP_KEY_ID`) | `.env`, baked into every build | Section A key and NTAG passwords. Keeps generic NFC apps out; extractable by someone who unpacks the app, so only name/blood type/ID live there |
| `TAG_RESPONDER_PUBLIC_KEY` (+ `TAG_RESPONDER_KEY_ID`) | `.env` | Seals section B when writing |
| Responder private keys | Supabase secrets `TAG_RESPONDER_KEY_<id>` (plus the legacy JSON secret `TAG_RESPONDER_PRIVATE_KEYS`, which holds key 1 on this project); `responder-keys` Edge Function gives **all configured ids** to **active personnel only** (audited as `fetch_tag_keys`); cached in `EncryptedStorage` as a keyring | Opens section B. Keyring is replaced on each online personnel check (so new keys arrive and retired ones disappear), fetched when missing, deleted when the account stops being personnel |

**Key management** — `scripts/tag-keys.mjs`:

| Command | Does |
|---------|------|
| `status` | Key ids in `.env` vs on Supabase (public-key fingerprint only) |
| `init` | First-time setup: app secret + responder key 1 (refuses if keys exist) |
| `rotate` | New responder key `n+1` → Supabase secret; `.env` now seals new tags to it. Old keys stay, so old tags remain readable |
| `retire <id> --yes` | Deletes an old responder key (refuses the current one) |

**Rotation procedure** (e.g. a responder phone is lost): `rotate` → rebuild and distribute the app with the new `.env` → responders pick up the new key on their next online check, civilians see "NFC tag is out of date" (`LocalUser.tagKeyId` ≠ current key; `getSyncStatus(currentResponderKeyId())`) and rewrite → `retire <old id> --yes`. An online responder who scans a tag sealed to a key it doesn't hold yet refreshes the keyring once and retries. The app secret is not rotated (it would lock LifeTap out of every write-protected tag).

**Tests** — `npm run test:tags` (`scripts/test-tag-crypto.mjs`): 37 checks covering payload encryption (civilian/responder/public views, tampering, wrong keys, sizes), key rotation, and NTAG216 write protection against a simulated chip (password, refused writes, tearing, erase, unsupported/read-only tags).

### Privacy on Tag

A private profile's tag reveals only LifeTap ID, name, blood type and the SMS choice to the LifeTap app; everything else needs the responder key. `NFCResultScreen` uses `isAuthorized = (isResponder || is_public) && !restricted`. A responder whose device lacks the key sees "Medical details couldn't be unlocked — treat allergies and medications as unknown", never "no known allergies"; report entries from such scans are marked `restricted` and filled in by a later full scan.

---

## 11. Services

### NFC (`src/services/nfc.ts`)
See Section 10.

### Reports Sync (`src/services/reports.ts`)

| Function | Description |
|----------|-------------|
| `syncReportToCloud(report)` | Upserts a single report to Supabase `reports` table, then calls `markReportSynced()` |
| `syncAllUnsyncedReports(owner)` | Gets all reports, filters `!syncedToCloud` **and owned by `owner`**, calls `syncReportToCloud()` on each (the server stamps `created_by` = caller, so uploading another account's report would misfile it) |

Called automatically on app foreground (via `AppContext`) and manually from `ReportDetailScreen`.

### SMS (`src/services/sms.ts`)

| Function | Description |
|----------|-------------|
| `sendVictimAlert(entry, location)` | Calls Supabase Edge Function `send-sms` with victim name, kin phone numbers (PH mobiles only), location, and time. Maps 401/403/429 to readable errors; `sentTo` lists numbers the server actually delivered to |

The Edge Function (`supabase/functions/send-sms/`) uses Twilio to send parallel SMS messages. It:
- verifies the caller's JWT and requires an **active `personnel` row** (403 otherwise)
- takes the responder name from the personnel record, not the client
- accepts only `+639XXXXXXXXX` numbers, deduped, max 5 per alert
- rate-limits each responder (`SMS_ALERTS_PER_HOUR`, default 60) by counting `send_sms_alert` rows in `public.audit_log`, and writes one audit row per alert (counts only, no numbers or names)
- returns 200 if at least one SMS was sent; Twilio error details stay in server logs

Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets, plus the dashboard's `audit_log` table (`lifetap-dashboard/db/audit.sql`).

### Personnel (`src/services/personnel.ts`)

| Function | Description |
|----------|-------------|
| `lookupPersonnel(phone)` | Returns `found` / `not_found` / `error` so network failures never change a role |
| `saveLoginSession(authSession, phone)` | Shared by both OTP login flows: looks up personnel, builds and saves the `CloudSession`, reports whether the check failed |

### Account Deletion (`supabase/functions/delete-account/`)

Deno Edge Function invoked from `SettingsScreen` when a civilian deletes their account.

1. Verifies the caller's JWT using the anon key client
2. Deletes the user's row from the `users` table (matched by `owner_id`)
3. Deletes the auth user record via the admin client (service role key)

Requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — all automatically available in Supabase Edge Functions. Deploy with `supabase functions deploy delete-account`.

---

## 12. Supabase Integration

**File:** `src/lib/supabase.ts`

```typescript
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureAuthStorage,   // EncryptedStorage; migrates old AsyncStorage sessions on first read
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
- `created_by` (auth UUID) is stamped by a `before insert` trigger
- RLS: dashboard policies (`lifetap-dashboard/db/policies.sql`) for city-scoped select, in-city insert and admin write, plus `reports_select_own` / `reports_update_own` so active personnel can re-sync reports they filed. Civilians have no access.

### Applied Migrations

| File | Description |
|------|-------------|
| `supabase/migrations/20260425000000_create_reports_table.sql` | Creates `reports` table + RLS policy |
| `supabase/migrations/20260425000001_users_unique_owner.sql` | Adds unique constraint on `users.owner_id` to prevent duplicate profiles per auth account |
| `supabase/migrations/20260911000000_reports_rls_ownership.sql` | Drops the open "responders can upsert reports" policy, adds `created_by` + backfill + insert trigger, adds own-report select/update policies. Aborts if the dashboard's `policies.sql` isn't applied |
| `supabase/migrations/20260912000000_consent_and_personnel_guard.sql` | Adds `users.consent_*` + `consent_details`, `personnel.undertaking_*`, and a `before update` trigger so non-admin callers can only change `last_login` / `undertaking_*` on their own personnel row (closes `personnel_update_self` letting a responder make themselves admin or reactivate themselves) |

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

- Supabase session is kept in `EncryptedStorage` (Keychain / EncryptedSharedPreferences) by the Supabase client via `secureAuthStorage` (persistent, auto-refreshed)
- `CloudSession` in `EncryptedStorage` mirrors the tokens + adds role fields and `personnel_verified_at`
- `AppContext.onAuthStateChange` listener catches `TOKEN_REFRESHED` and syncs the `EncryptedStorage` copy; `SIGNED_OUT` clears it. That is the only thing that ends a session — an expired access token does not
- Personnel role stays usable offline for 30 days since last online confirmation, and is re-checked on every foreground

### Sign Out

1. `clearCloudSession()` — removes from EncryptedStorage
2. `supabase.auth.signOut()` — invalidates session
3. `deactivateReport()` — prevents active report from leaking to next session (civilian Settings; redundant now but harmless)
4. `refreshSession()` — updates AppContext → navigators re-render, role → null, and clears any active report not owned by the current session (this covers responder sign-out and server-side `SIGNED_OUT` too)

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
navigation.replace('NFCResult', { data })
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
SyncOverlay fetches the account's cloud record (users where owner_id = signed-in user)
    ↓
  No record → "Local is newer" (No cloud record) → Upload
  Record with a different id → "Your account has a different profile" → user picks pull or upload
  Same id → compare localUser.lastModified vs users.updated_at (5-sec tolerance):
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
  role: 'medic' | 'responder' | 'admin'
  city: string | null
  badge_no: string | null
  organization: string | null
}

type ReportEntry = {
  id: string
  tagId: string       // NFC tag ID — used for dedup in addEntryToReport
  n: string           // victim name
  bt: string          // blood type
  dob: string
  a: string[]         // allergies
  c: string[]         // conditions
  meds: string[]
  kin: Kin[]
  scannedAt: number   // Unix ms (Date.now())
  smsSent: boolean
}

type Report = {
  id: string
  name: string
  date: string
  location: string
  responderName: string
  responderPhone: string
  city: string | null
  isActive: boolean
  entries: ReportEntry[]
  createdAt: number   // Unix ms (Date.now())
  syncedToCloud: boolean
}
```

### `src/navigation/types.ts`

```typescript
type RootStackParamList = {
  Main: undefined
  ReadNFC: undefined                    // fromReport no longer a route param
  WriteNFC: undefined
  SyncOverlay: undefined
  Success: { message: string; subMessage?: string }
  NFCResult: { data: any; fromReport?: string | null; viewOnly?: boolean }
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
    personnel.ts                lookupPersonnel, saveLoginSession
  storage/
    asyncStorage.ts             All local persistence — types + all CRUD functions
  components/
    ErrorBoundary.tsx
    NFCStatusPill.tsx
    NFCanimations.tsx           RippleRing, BouncingDot
    NFCsheet.tsx                Slide-up bottom sheet
  types/
    responder.ts                UserRole, ResponderProfile, ReportEntry, Report
  hooks/
    useScannerAnimation.ts      Radial scanner animation (Home + Scan), off under Reduce Motion
  crypto/
    tagFormat.ts                Tag payload v2 encryption (pure TS, tested in Node)
    ntag.ts                     Raw NTAG213/215/216 commands + write protection
    keys.ts                     Tag keys (.env) + responder keyring
  legal/
    privacyNotice.ts            Privacy notice + responder undertaking text

__tests__/                      Jest: App render, report storage, tag payload parsing, sync status
jest.setup.js                   Native-module mocks (in-memory Keychain, config, NFC, animations)
scripts/
  tag-keys.mjs                  Tag key management (status / init / rotate / retire)
  test-tag-crypto.mjs           Tag encryption + rotation + simulated-NTAG216 tests

supabase/
  functions/
    send-sms/index.ts           Deno Edge Function — Twilio SMS to next of kin
    delete-account/index.ts     Deno Edge Function — deletes profile + auth user (App Store compliance)
  migrations/
    20260425000000_create_reports_table.sql
    20260425000001_users_unique_owner.sql
    20260911000000_reports_rls_ownership.sql
```

---

### Testing

| Command | Runs |
|---------|------|
| `npm test` | Jest, then `test:tags` |
| `npx jest` | App render smoke test; report storage (migration, one-write-per-scan, concurrent scans, sync race, ownership); `parseTagPayload`; `getSyncStatus` (encryption + key-rotation rewrite prompts) |
| `npm run test:tags` | 37 checks: tag encryption, key rotation, NTAG216 write protection on a simulated chip |

Jest mocks live in `jest.setup.js`: an in-memory stand-in for the Keychain (rejects removing missing keys like iOS), react-native-config, the NFC native module, and `NativeAnimatedHelper` (JS-driver animations). `global.css` maps to `__mocks__/styleMock.js`.

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
| `SMS_ALERTS_PER_HOUR` (optional, default 60) | `supabase/functions/send-sms/` |
| `TAG_RESPONDER_KEY_<id>` (hex; one per key id) and legacy `TAG_RESPONDER_PRIVATE_KEYS` (JSON) | `supabase/functions/responder-keys/` |

Tag encryption keys in `.env` (managed by `scripts/tag-keys.mjs`; rebuild after changing — react-native-config bakes them in): `TAG_APP_SECRET`, `TAG_APP_KEY_ID`, `TAG_RESPONDER_PUBLIC_KEY`, `TAG_RESPONDER_KEY_ID`.

---

## 18. Known Gaps & Future Work

### High Priority
- **QR code fallback** — If a civilian loses their NFC tag, responders have no backup access. A per-civilian QR code (printable from the app) linking to a public `/e/[id]` route on the dashboard would close this gap. `is_public` flag already supports controlled public access.
- **Session re-auth prompt** — When the Supabase session expires mid-use in the field, the app silently fails cloud operations. It should detect the expired state and prompt for OTP re-auth rather than failing quietly.
- **Biometric app lock** — Not implemented; the App Lock toggle is hidden in Settings until biometric (`react-native-biometrics`) and PIN entry exist.

### Medium Priority
- **Privacy notice review** — The notice in `src/legal/privacyNotice.ts` still carries the "Draft" label: have the capstone adviser review it, then set `NOTICE_IS_DRAFT = false`. If an LGU adopts LifeTap it becomes the controller, and the notice needs rewriting around its DPO and retention rules (bump `PRIVACY_NOTICE_VERSION` then). (Re-consent on version change is implemented via `ConsentGate`.)
- **Consent history** — Only the current consent state is stored (locally and on `users`). An append-only consent log would give a full history of changes and withdrawals.
- **Tag cloning** — Accepted limitation for the capstone. A tag's bytes can be copied to a blank tag; the copy can't be decrypted any further than the original, but it would show a responder the wrong person's profile. Detecting copies means binding the payload to the chip's read-only serial (already used to derive the NTAG password) as additional authenticated data — a new tag format, every tag rewritten once, and the read path moved from the NDEF session to the raw MIFARE one, since iOS only exposes the serial there. Counterfeit tags with a writable serial defeat even that; real anti-cloning needs NTAG 424 DNA (per-tap AES CMAC).
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
- [ ] Deploy Edge Functions: `supabase functions deploy send-sms`, `supabase functions deploy delete-account` and `supabase functions deploy responder-keys`
- [ ] Every personnel row with role medic/responder has a `city` — `reports_insert_in_city` rejects reports otherwise, and that responder's reports never upload
- [ ] Generate tag keys once (`node scripts/tag-keys.mjs init`) and back up the resulting `.env` outside the build machine; use `rotate` / `retire` afterwards, never `init --force` on a deployment with written tags
- [ ] `npm test` passes (Jest + tag crypto)
- [ ] `package.json` `version` matches the iOS/Android app version (Settings → About shows it)
- [ ] Enable RLS on `users`, `personnel`, `reports` tables in Supabase dashboard
- [ ] Run all SQL migrations via `supabase db push` (or apply `policies.sql` → `audit.sql` → `consent.sql` → `users-active.sql` → `20260425000000_create_reports_table.sql` → `20260425000001_users_unique_owner.sql` → `20260911000000_reports_rls_ownership.sql` → `20260912000000_consent_and_personnel_guard.sql` → `20260912100000_lock_down_profile_reads.sql`)
- [ ] Set Supabase OTP rate limit (recommended: 5 per phone per hour)
- [ ] Test NFC write/read on target Android devices (behavior varies by OEM)
- [ ] Test OTP SMS delivery on Philippine carriers (Globe, Smart, DITO)
- [ ] Build release APK/IPA and test on physical devices — NFC does not work in simulators
- [ ] Android builds need **JDK 17** (`brew install --cask zulu@17`; build with `JAVA_HOME=$(/usr/libexec/java_home -v 17)`). Without it, Gradle 9 fails with a `JvmVendorSpec … IBM_SEMERU` error while trying to auto-download a toolchain
- [ ] Android release builds run R8 (`enableProguardInReleaseBuilds = true`); `proguard-rules.pro` keeps `com.lifetap.BuildConfig` so react-native-config can read the Supabase keys. Release JS bundles strip `console.log/info/debug` (`babel.config.js`)
