import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  getLocalUser,
  getAppSettings,
  updateAppSettings,
  LocalUser,
  AppSettings,
} from '../storage/asyncStorage';

type LockMethod = 'faceid' | 'pin';

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

export default function AccountScreen() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true);
        const [userData, settingsData] = await Promise.all([
          getLocalUser(),
          getAppSettings(),
        ]);
        setUser(userData);
        setSettings(settingsData);
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

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-teal-900 text-2xl font-bold mt-6 mb-4">Account</Text>

        {/* Profile card — or no profile state */}
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
          <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-2">
            <Text className="text-amber-800 text-sm font-semibold">No profile set up</Text>
            <Text className="text-amber-600 text-xs mt-0.5">
              Go to the Profile tab to create your LifeTap profile
            </Text>
          </View>
        )}

        {/* App Lock */}
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
                  <View
                    className="flex-row bg-teal-50 rounded-xl p-1"
                    style={{ gap: 4 }}
                  >
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

        {/* Sync status summary */}
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
                    {user.syncedToCloud ? '✅ Synced' : '⚠️ Out of date'}
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