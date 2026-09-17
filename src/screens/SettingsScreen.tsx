import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ConsentForm, {
  ConsentDraft,
  draftFromRecord,
  validateConsentDraft,
  recordFromDraft,
} from '../components/ConsentForm';
import PrivacyNoticeModal from '../components/PrivacyNoticeModal';
import SignInNotice from '../components/SignInNotice';
import { CONTROLLER, PRIVACY_NOTICE_VERSION } from '../legal/privacyNotice';
import { supabase, signOutSupabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { saveLoginSession } from '../services/personnel';
import {
  consentChangeKind,
  recordConsentEvent,
  uploadPendingConsentEvents,
} from '../services/consentLog';
import ConsentHistoryModal from '../components/ConsentHistoryModal';
import { PH_MOBILE_E164, toPHE164 } from '../services/phone';
import {
  getLocalUser,
  getCloudSession,
  clearCloudSession,
  clearLocalUser,
  clearConsentLog,
  updateLocalUser,
  isTagCurrent,
  LocalUser,
  CloudSession,
} from '../storage/asyncStorage';
import { currentResponderKeyId } from '../crypto/keys';
// Keep package.json's version in step with the iOS/Android app version.
import { version as appVersion } from '../../package.json';
type LoginStep = 'phone' | 'otp' | 'loading';


function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text className="text-teal-700 text-xs font-semibold uppercase tracking-widest mb-2 mt-5">
      {title}
    </Text>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {children}
    </View>
  );
}

function SettingsRow({
  label,
  sub,
  right,
  last = false,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View
      className="flex-row items-center px-4 py-3"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
    >
      <View className="flex-1">
        <Text className="text-slate-700 text-sm">{label}</Text>
        {sub && <Text className="text-slate-400 text-xs mt-0.5">{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

// ─────────────────────────────────────────────
// LOGIN SHEET — phone + OTP steps
// ─────────────────────────────────────────────

function LoginSheet({ onSuccess, onCancel }: {
  onSuccess: (session: CloudSession) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const formatPhone = toPHE164;

  async function handleSendOTP() {
    setError(null);
    const formatted = formatPhone(phone);

    if (!PH_MOBILE_E164.test(formatted)) {
      setError('Enter a valid PH mobile number (e.g. 09171234567)');
      return;
    }

    setStep('loading');

    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: formatted,
    });

    if (otpError) {
      setError(otpError.message);
      setStep('phone');
      return;
    }

    setStep('otp');
  }

  async function handleVerifyOTP() {
    setError(null);

    if (otp.length < 4) {
      setError('Please enter the OTP code');
      return;
    }

    setStep('loading');

    const formatted = formatPhone(phone);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: formatted,
      token: otp,
      type: 'sms',
    });

    if (verifyError || !data.session) {
      setError(verifyError?.message ?? 'Verification failed');
      setStep('otp');
      return;
    }

    const { session, personnelCheckFailed } = await saveLoginSession(data.session, formatted);
    if (personnelCheckFailed) {
      Alert.alert(
        'Signed in',
        "We couldn't confirm responder access right now. If you're LifeTap personnel, responder features will unlock automatically once the app can reach the server."
      );
    }
    onSuccess(session);
  }

  function handleReset() {
    setStep('phone');
    setOtp('');
    setError(null);
  }

  if (step === 'loading') {
    return (
      <View className="py-10 items-center">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="text-slate-400 text-sm mt-3">Please wait...</Text>
      </View>
    );
  }

  if (step === 'otp') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text className="text-teal-900 text-lg font-bold mb-1">
          Enter OTP
        </Text>
        <Text className="text-slate-400 text-sm mb-6">
          We sent a 6-digit code to {formatPhone(phone)}
        </Text>

        <View className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
            OTP Code
          </Text>
          <TextInput
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            placeholderTextColor="#cbd5e1"
            keyboardType="number-pad"
            maxLength={6}
            className="text-slate-800 text-2xl tracking-widest py-1"
            autoFocus
          />
        </View>

        {error && (
          <Text className="text-red-400 text-xs mb-4">{error}</Text>
        )}

        <TouchableOpacity
          onPress={handleVerifyOTP}
          className="bg-teal-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleReset}>
          <Text className="text-slate-400 text-sm text-center">
            Wrong number? Go back
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  // step === 'phone'
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text className="text-teal-900 text-lg font-bold mb-1">
        Sign In to Cloud
      </Text>
      <Text className="text-slate-400 text-sm mb-6">
        Enter your phone number to receive a one-time code. An account is created automatically if you don't have one.
      </Text>

      <View className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
          Phone Number
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 09171234567"
          placeholderTextColor="#cbd5e1"
          keyboardType="phone-pad"
          className="text-slate-800 text-sm py-1"
          autoFocus
        />
      </View>

      {error && (
        <Text className="text-red-400 text-xs mb-4">{error}</Text>
      )}

      <SignInNotice />

      <TouchableOpacity
        onPress={handleSendOTP}
        className="bg-teal-600 rounded-2xl py-4 items-center mb-3"
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">Send Code</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel}>
        <Text className="text-slate-400 text-sm text-center">Cancel</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────
// CONSENT MODAL — review or change consent choices
// ─────────────────────────────────────────────

function ConsentModal({
  user,
  onClose,
  onSaved,
}: {
  user: LocalUser;
  onClose: () => void;
  onSaved: (u: LocalUser) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ConsentDraft>(() => draftFromRecord(user.consent));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const dob = user.dob ? new Date(user.dob + 'T00:00:00') : null;
    const age = dob && !isNaN(dob.getTime())
      ? Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    const err =
      validateConsentDraft(draft) ??
      (age !== null && age < 18 && draft.consenter !== 'guardian'
        ? 'This profile belongs to someone under 18, so a parent or guardian must give consent.'
        : null);
    if (err) { setError(err); return; }

    const next = recordFromDraft(draft, user.consent, user.consent?.contactsConfirmed ?? false);
    const kind = consentChangeKind(user.consent, next);
    if (!kind) {
      // Nothing changed. Saving anyway would mark the tag and cloud out of date.
      onClose();
      return;
    }

    setSaving(true);
    // updateLocalUser: the SMS choice lives on the tag, so a change here marks
    // the tag (and cloud) out of date and the Home screen prompts a re-write.
    const updated = await updateLocalUser({ consent: next });
    if (updated) await recordConsentEvent(kind, updated);
    setSaving(false);
    if (updated) onSaved(updated);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-teal-50" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="text-teal-900 text-lg font-bold">Your consent</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text className="text-slate-500 text-sm font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <ConsentForm draft={draft} onChange={d => { setDraft(d); setError(null); }} />
          <Text className="text-slate-400 text-xs leading-4 mb-4">
            To withdraw consent completely, close this and use “Withdraw consent &
            delete my data”.
          </Text>
          {error && (
            <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-3">
              <Text className="text-red-500 text-xs">{error}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="bg-teal-600 rounded-2xl py-4 items-center"
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="white" /> : (
              <Text className="text-white font-semibold">Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}



// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { refreshSession, deactivateReport } = useApp();
  const navigation = useNavigation<any>();

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true);
        const [userData, sessionData] = await Promise.all([
          getLocalUser(),
          getCloudSession(),
        ]);
        setUser(userData);
        setSession(sessionData);
        setLoading(false);
      }
      load();
    }, [])
  );

  // Deletes the cloud account (if signed in) and the profile on this phone.
  // Shared by Delete Account and Withdraw Consent. Returns false if the cloud
  // deletion failed — local data is then left untouched so nothing is lost.
  async function eraseEverything(reason: 'withdraw_consent' | 'delete_account'): Promise<boolean> {
    try {
      if (session) {
        // Get any consent history not yet copied to the cloud there first; the
        // function then records the withdrawal / deletion itself.
        await uploadPendingConsentEvents().catch(() => {});
        const res = await supabase.functions.invoke('delete-account', {
          method: 'POST',
          body: { reason, noticeVersion: user?.consent?.version ?? null },
        });
        if (res.error) throw res.error;
        await clearCloudSession();
        await signOutSupabase();
      }
      await clearLocalUser();
      await clearConsentLog();
      await deactivateReport();
      await refreshSession();
      setSession(null);
      setUser(null);
      return true;
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to delete your data. Please try again.');
      return false;
    }
  }

  // Runs after the profile is deleted, so the tag's owner id is passed in —
  // WriteNFC can no longer read it from the phone, and without it the user's
  // own tag would be flagged as "someone else's LifeTap".
  function promptEraseTag(ownId: string) {
    Alert.alert(
      'Erase your tag too?',
      'Your LifeTap tag still holds your information. Erase it now by holding it to your phone, or do it later from Settings.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Erase Tag', onPress: () => navigation.navigate('WriteNFC', { mode: 'erase', ownId }) },
      ]
    );
  }

  function handleWithdrawConsent() {
    Alert.alert(
      'Withdraw consent?',
      (session
        ? 'This permanently deletes your LifeTap profile from this phone and your cloud account. '
        : 'This permanently deletes your LifeTap profile from this phone. ') +
        'Incident reports already filed by responders are kept by the LGU.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw & Delete',
          style: 'destructive',
          onPress: async () => {
            const ownId = user?.id;
            if ((await eraseEverything('withdraw_consent')) && ownId) promptEraseTag(ownId);
          },
        },
      ]
    );
  }

  async function handleDownloadData() {
    if (!user) return;
    // Everything the user gave us, without device-only sync flags.
    const data = {
      id: user.id, n: user.n, dob: user.dob, bt: user.bt, rel: user.rel, od: user.od,
      brg: user.brg, cty: user.cty, phn: user.phn,
      a: user.a, c: user.c, meds: user.meds, kin: user.kin,
      is_public: user.is_public, lastModified: user.lastModified, consent: user.consent ?? null,
    };
    Alert.alert(
      'Download a copy of your data',
      'This opens the share sheet with your full profile, including medical information, as text. Anyone you share it with can read it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            Share.share({
              title: 'My LifeTap data',
              message: JSON.stringify({ exportedAt: new Date().toISOString(), profile: data }, null, 2),
            }).catch(() => {});
          },
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data from our servers. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account, cloud profile, and all data will be permanently deleted. You will not be able to recover your account.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    if (!session) return;
                    const ownId = user?.id;
                    if ((await eraseEverything('delete_account')) && ownId) promptEraseTag(ownId);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your cloud account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearCloudSession();
            await signOutSupabase();
            await deactivateReport(); // prevent active report leaking to next sign-in
            await refreshSession();
            setSession(null);
          },
        },
      ]
    );
  }

  async function handleLoginSuccess(newSession: CloudSession) {
    setSession(newSession);
    setShowLogin(false);
    await refreshSession();
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  // ── LOGIN SHEET MODE ──
  if (showLogin) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mt-10">
            <LoginSheet
              onSuccess={handleLoginSuccess}
              onCancel={() => setShowLogin(false)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  async function handleClearLocalData() {
    // First prompt — warn about data loss
    Alert.alert(
      'Clear Local Data',
      user?.syncedToCloud
        ? 'This will remove all your locally stored profile data from this device. Your data is backed up to the cloud and can be restored by signing in again.'
        : '⚠️ Your data is NOT backed up to the cloud.\n\nIf you continue, your profile, medical info, and emergency contacts will be permanently deleted from this device with no way to recover them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: user?.syncedToCloud ? 'default' : 'destructive',
          onPress: () => {
            // Second prompt — final confirmation
            Alert.alert(
              'Are you absolutely sure?',
              'This action cannot be undone. All local profile data will be permanently deleted from this device.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Data',
                  style: 'destructive',
                  onPress: async () => {
                    // Backed-up history goes to the cloud before the phone's copy is erased.
                    await uploadPendingConsentEvents().catch(() => {});
                    await clearLocalUser();
                    await clearConsentLog();
                    setUser(null);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  const tagCurrent = user ? isTagCurrent(user, currentResponderKeyId()) : false;

  // ── MAIN ACCOUNT VIEW ──
  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 54 + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-teal-900 text-2xl font-bold mt-6 mb-4">Account</Text>

        {/* Local profile card */}
        {user ? (
          <SettingsCard>
            <View className="flex-row items-center px-4 py-3" style={{ gap: 12 }}>
              <View className="w-11 h-11 rounded-xl bg-teal-700 items-center justify-center">
                <Text className="text-white text-sm font-semibold">
                  {getInitials(user.n)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-800 text-sm font-semibold">{user.n}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  {user.id} · {user.bt}
                </Text>
              </View>
              <View
                className="rounded-lg px-2 py-1"
                style={{
                  backgroundColor: user.is_public ? '#f0fdfa' : '#fefce8',
                  borderWidth: 1,
                  borderColor: user.is_public ? '#99f6e4' : '#fde68a',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: user.is_public ? '#0f766e' : '#92400e' }}
                >
                  {user.is_public ? 'Public' : 'Private'}
                </Text>
              </View>
            </View>
          </SettingsCard>
        ) : (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <Text className="text-amber-800 text-sm font-semibold">No profile set up</Text>
            <Text className="text-amber-600 text-xs mt-0.5">
              Go to the Profile tab to create your LifeTap profile
            </Text>
          </View>
        )}

        {/* Cloud account */}
        <SectionLabel title="Cloud Account" />
        {session ? (
          <SettingsCard>
            {/* Logged in state */}
            <View className="px-4 py-3 border-b border-slate-50">
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <View className="w-9 h-9 rounded-xl bg-teal-100 items-center justify-center">
                  <Text className="text-teal-700 text-base">☁️</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-800 text-sm font-semibold">
                    {session.full_name ?? 'Civilian Account'}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{session.phone}</Text>
                </View>
                {session.role && (
                  <View className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                    <Text className="text-teal-700 text-xs font-semibold capitalize">
                      {session.role}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Personnel details if applicable */}
            {session.role && (
              <View className="px-4 py-3 border-b border-slate-50">
                <Text className="text-xs text-slate-400 mb-1">Organization</Text>
                <Text className="text-slate-700 text-sm">
                  {session.organization ?? '—'}
                </Text>
                {session.city && (
                  <>
                    <Text className="text-xs text-slate-400 mt-2 mb-1">Coverage</Text>
                    <Text className="text-slate-700 text-sm">{session.city}</Text>
                  </>
                )}
              </View>
            )}

            <SettingsRow
              label="Sign Out"
              right={
                <TouchableOpacity onPress={handleSignOut}>
                  <Text className="text-red-400 text-sm font-semibold">Sign Out</Text>
                </TouchableOpacity>
              }
            />
            <SettingsRow
              label="Delete Account"
              sub="Permanently delete your account and all data"
              last
              right={
                <TouchableOpacity onPress={handleDeleteAccount}>
                  <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                </TouchableOpacity>
              }
            />
          </SettingsCard>
        ) : (
          <SettingsCard>
            <View className="px-4 py-4 items-center">
              <Text className="text-slate-500 text-sm text-center mb-1">
                Sign in to back up your profile to the cloud
              </Text>
              <Text className="text-slate-400 text-xs text-center mb-4">
                Personnel can also unlock responder features after signing in
              </Text>
              <TouchableOpacity
                onPress={() => setShowLogin(true)}
                className="bg-teal-600 rounded-2xl px-8 py-3 items-center w-full"
                activeOpacity={0.85}
              >
                <Text className="text-white font-semibold">Sign In with Phone</Text>
              </TouchableOpacity>
            </View>
          </SettingsCard>
        )}

        {/* App Lock is intentionally not shown until biometric/PIN unlock is
            implemented — a toggle that doesn't protect anything would mislead
            users about the security of their medical data. AppSettings still
            stores appLockEnabled/lockMethod for when it's built. */}

        {/* Sync */}
        {user && (
          <>
            <SectionLabel title="Sync" />
            <SettingsCard>
              <SettingsRow
                label="NFC Tag"
                right={
                  <Text className="text-xs font-semibold"
                    style={{ color: tagCurrent ? '#0f766e' : '#f59e0b' }}>
                    {tagCurrent ? '✅ Synced' : '⚠️ Out of date'}
                  </Text>
                }
              />
              <SettingsRow
                label="Cloud"
                right={
                  <Text className="text-xs font-semibold"
                    style={{ color: user.syncedToCloud ? '#0f766e' : '#f59e0b' }}>
                    {user.syncedToCloud
                      ? '✅ Synced'
                      : session ? '⚠️ Out of date' : '—  Not signed in'}
                  </Text>
                }
              />
              <SettingsRow
                label="Last Modified"
                right={
                  <Text className="text-slate-400 text-xs">
                    {new Date(user.lastModified).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                }
                last
              />
            </SettingsCard>
          </>
        )}

        {/* Danger Zone */}
          {user && (
            <>
              <SectionLabel title="Data" />
              <SettingsCard>
                <View className="px-4 py-4">
                  <Text className="text-slate-500 text-xs mb-3 leading-5">
                    {user.syncedToCloud
                      ? 'Your data is backed up to the cloud. You can safely clear local data and restore it by signing in again.'
                      : 'Your data is only stored locally on this device. Clearing it without a cloud backup will permanently delete your profile.'}
                  </Text>
                  <TouchableOpacity
                    onPress={handleClearLocalData}
                    className="rounded-2xl py-3 items-center border"
                    style={{
                      borderColor: user.syncedToCloud ? '#fca5a5' : '#ef4444',
                      backgroundColor: user.syncedToCloud ? '#fff1f2' : '#fef2f2',
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: user.syncedToCloud ? '#dc2626' : '#b91c1c' }}
                    >
                      Clear Local Data
                    </Text>
                    {!user.syncedToCloud && (
                      <Text className="text-xs mt-0.5" style={{ color: '#ef4444' }}>
                        ⚠️ Not backed up — data will be lost
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </SettingsCard>
            </>
          )}

        {/* Privacy & Consent — Data Privacy Act rights in one place */}
        <SectionLabel title="Privacy & Consent" />
        <SettingsCard>
          <TouchableOpacity onPress={() => setNoticeOpen(true)} activeOpacity={0.8}>
            <SettingsRow
              label="Privacy notice"
              sub={`Version ${PRIVACY_NOTICE_VERSION}`}
              right={<Text className="text-slate-300 text-lg">›</Text>}
            />
          </TouchableOpacity>

          {user && (
            <>
              <TouchableOpacity
                onPress={() => setConsentOpen(true)}
                activeOpacity={0.8}
                disabled={!user.consent}
              >
                <SettingsRow
                  label="Your consent"
                  sub={
                    user.consent
                      ? `Given ${new Date(user.consent.acceptedAt).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}${user.consent.guardian ? ` by ${user.consent.guardian.name} (${user.consent.guardian.relationship})` : ''}` +
                        ` · SMS alerts ${user.consent.smsAlerts ? 'on' : 'off'}` +
                        ` · Cloud backup ${user.consent.cloudBackup ? 'on' : 'off'}`
                      : 'Not given yet — open the Profile tab to review'
                  }
                  right={user.consent ? <Text className="text-teal-700 text-xs font-semibold">Change</Text> : undefined}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setHistoryOpen(true)} activeOpacity={0.8}>
                <SettingsRow
                  label="Consent history"
                  sub="When you gave or changed consent, and what you chose"
                  right={<Text className="text-slate-300 text-lg">›</Text>}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownloadData} activeOpacity={0.8}>
                <SettingsRow
                  label="Download a copy of my data"
                  right={<Text className="text-slate-300 text-lg">›</Text>}
                />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => navigation.navigate('WriteNFC', { mode: 'erase' })}
            activeOpacity={0.8}
          >
            <SettingsRow
              label="Erase my LifeTap tag"
              sub="Removes all information from a tag you hold to your phone"
              right={<Text className="text-slate-300 text-lg">›</Text>}
            />
          </TouchableOpacity>

          {user && (
            <TouchableOpacity onPress={handleWithdrawConsent} activeOpacity={0.8}>
              <SettingsRow
                label="Withdraw consent & delete my data"
                sub={session ? 'Deletes your profile here and your cloud account' : 'Deletes your profile from this phone'}
                right={<Text className="text-red-500 text-xs font-semibold">Withdraw</Text>}
              />
            </TouchableOpacity>
          )}

          <SettingsRow
            label="Privacy questions or concerns"
            sub={`Email ArchTech at ${CONTROLLER.contact}`}
            last
          />
        </SettingsCard>

        {/* About */}
        <SectionLabel title="About" />
        <SettingsCard>
          <SettingsRow
            label="Version"
            right={<Text className="text-slate-400 text-xs">{appVersion}</Text>}
          />
          <SettingsRow
            label="LifeTap"
            sub="NFC-based medical ID system"
            last
          />
        </SettingsCard>

      </ScrollView>

      <PrivacyNoticeModal visible={noticeOpen} onClose={() => setNoticeOpen(false)} />
      {historyOpen && <ConsentHistoryModal onClose={() => setHistoryOpen(false)} />}
      {consentOpen && user && (
        <ConsentModal
          user={user}
          onClose={() => setConsentOpen(false)}
          onSaved={updated => {
            setUser(updated);
            setConsentOpen(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}