import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import {
  getLocalUser,
  getAppSettings,
  updateAppSettings,
  getCloudSession,
  saveCloudSession,
  clearCloudSession,
  clearLocalUser,
  LocalUser,
  AppSettings,
  CloudSession,
} from '../storage/asyncStorage';
type LockMethod = 'faceid' | 'pin';
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

  // Format phone to E.164 (+63 format)
  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '+63' + digits.slice(1);
    if (digits.startsWith('63')) return '+' + digits;
    if (digits.startsWith('+63')) return digits;
    return '+63' + digits;
  }

  async function handleSendOTP() {
    setError(null);
    const formatted = formatPhone(phone);

    if (formatted.length < 12) {
      setError('Please enter a valid phone number');
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

    // Check if this phone belongs to personnel
    const { data: personnelData } = await supabase
      .from('personnel')
      .select('full_name, role, city, badge_no, organization')
      .eq('phone', formatted)
      .eq('is_active', true)
      .single();

    const session: CloudSession = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      phone: formatted,
      user_id: data.session.user.id,
      expires_at: (data.session.expires_at ?? 0) * 1000, // convert to ms
      role: personnelData?.role ?? null,
      full_name: personnelData?.full_name ?? null,
      city: personnelData?.city ?? null,
      badge_no: personnelData?.badge_no ?? null,
      organization: personnelData?.organization ?? null,
    };

    await saveCloudSession(session);
    onSuccess(session);
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
        <Text className="text-teal-900 text-lg font-bold mb-1">Enter OTP</Text>
        <Text className="text-slate-400 text-sm mb-6">
          We sent a code to {formatPhone(phone)}
        </Text>

        <View className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
            OTP Code
          </Text>
          <TextInput
            value={otp}
            onChangeText={setOtp}
            placeholder="e.g. 123456"
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
          <Text className="text-white font-semibold">Verify</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setStep('phone'); setOtp(''); setError(null); }}>
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
      <Text className="text-teal-900 text-lg font-bold mb-1">Sign In to Cloud</Text>
      <Text className="text-slate-400 text-sm mb-6">
        Enter your phone number to receive a one-time code
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
// MAIN SCREEN
// ─────────────────────────────────────────────

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true);
        const [userData, settingsData, sessionData] = await Promise.all([
          getLocalUser(),
          getAppSettings(),
          getCloudSession(),
        ]);
        setUser(userData);
        setSettings(settingsData);
        setSession(sessionData);
        setLoading(false);
      }
      load();
    }, [])
  );

  async function handleToggleLock(value: boolean) {
    if (!settings) return;
    const updated = { ...settings, appLockEnabled: value };
    setSettings(updated);
    await updateAppSettings({ appLockEnabled: value });
  }

  async function handleLockMethod(method: LockMethod) {
    if (!settings) return;
    const updated = { ...settings, lockMethod: method };
    setSettings(updated);
    await updateAppSettings({ lockMethod: method });
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
            await supabase.auth.signOut();
            await clearCloudSession();
            setSession(null);
          },
        },
      ]
    );
  }

  function handleLoginSuccess(newSession: CloudSession) {
    setSession(newSession);
    setShowLogin(false);
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
                    await clearLocalUser();
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
              last
              right={
                <TouchableOpacity onPress={handleSignOut}>
                  <Text className="text-red-400 text-sm font-semibold">Sign Out</Text>
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

        {/* Security */}
        {settings && (
          <>
            <SectionLabel title="Security" />
            <SettingsCard>
              <SettingsRow
                label="Enable App Lock"
                sub="Require authentication on open"
                right={
                  <Switch
                    value={settings.appLockEnabled}
                    onValueChange={handleToggleLock}
                    trackColor={{ false: '#e2e8f0', true: '#0f766e' }}
                    thumbColor="#ffffff"
                  />
                }
              />
              {settings.appLockEnabled && (
                <View className="px-4 py-3">
                  <Text className="text-slate-500 text-xs mb-2">Lock Method</Text>
                  <View className="flex-row bg-teal-50 rounded-xl p-1" style={{ gap: 4 }}>
                    {(['faceid', 'pin'] as LockMethod[]).map(method => {
                      const active = settings.lockMethod === method;
                      return (
                        <TouchableOpacity
                          key={method}
                          onPress={() => handleLockMethod(method)}
                          activeOpacity={0.8}
                          className="flex-1 items-center py-2 rounded-lg"
                          style={{ backgroundColor: active ? '#0f766e' : 'transparent' }}
                        >
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: active ? '#ffffff' : '#94a3b8' }}
                          >
                            {method === 'faceid' ? 'Face ID' : 'PIN Lock'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text className="text-slate-400 text-xs mt-2">
                    {settings.lockMethod === 'faceid'
                      ? 'Face ID will be used to unlock the app.'
                      : 'You will be prompted to set a PIN.'}
                  </Text>
                </View>
              )}
            </SettingsCard>
          </>
        )}

        {/* Sync */}
        {user && (
          <>
            <SectionLabel title="Sync" />
            <SettingsCard>
              <SettingsRow
                label="NFC Tag"
                right={
                  <Text className="text-xs font-semibold"
                    style={{ color: user.syncedToTag ? '#0f766e' : '#f59e0b' }}>
                    {user.syncedToTag ? '✅ Synced' : '⚠️ Out of date'}
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

        {/* About */}
        <SectionLabel title="About" />
        <SettingsCard>
          <SettingsRow
            label="Version"
            right={<Text className="text-slate-400 text-xs">1.0.0</Text>}
          />
          <SettingsRow
            label="LifeTap"
            sub="NFC-based medical ID system"
            last
          />
        </SettingsCard>

      </ScrollView>
    </SafeAreaView>
  );
}