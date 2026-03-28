import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './../lib/supabase';

type LockMethod = 'faceid' | 'pin';

type User = {
  id: string;
  n: string;
  bt: string;
};

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [lockMethod, setLockMethod] = useState<LockMethod>('faceid');

  useEffect(() => {
    async function fetchUser() {
      const { data, error } = await supabase
        .from('users')
        .select('id, n, bt')
        .eq('id', 'lt-2')
        .limit(1)
        .single();

      if (error) console.error('Error fetching user:', error.message);
      else setUser(data);
      setLoading(false);
    }
    fetchUser();
  }, []);

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
        {/* Page Title */}
        <Text className="text-teal-900 text-2xl font-bold mt-6 mb-2">Account</Text>

        {/* Profile Card */}
        {user && (
          <SettingsCard>
            <View className="flex-row items-center px-4 py-3 gap-3">
              <View className="w-11 h-11 rounded-xl bg-teal-700 items-center justify-center">
                <Text className="text-white text-sm font-semibold">
                  {getInitials(user.n)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-800 text-sm font-semibold">{user.n}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">{user.id} · {user.bt}</Text>
              </View>
            </View>
          </SettingsCard>
        )}

        {/* App Lock */}
        <SectionLabel title="App Lock" />
        <SettingsCard>
          <SettingsRow
            label="Enable App Lock"
            sub="Require authentication on open"
            right={
              <Switch
                value={appLockEnabled}
                onValueChange={setAppLockEnabled}
                trackColor={{ false: '#e2e8f0', true: '#0f766e' }}
                thumbColor="#ffffff"
              />
            }
          />

          {/* Lock Method — segmented, only visible when lock is enabled */}
          {appLockEnabled && (
            <View className="px-4 py-3">
              <Text className="text-slate-500 text-xs mb-2">Lock Method</Text>
              <View className="flex-row bg-teal-50 rounded-xl p-1 gap-1">
                {(['faceid', 'pin'] as LockMethod[]).map((method) => {
                  const active = lockMethod === method;
                  return (
                    <TouchableOpacity
                      key={method}
                      onPress={() => setLockMethod(method)}
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
                {lockMethod === 'faceid'
                  ? 'Face ID will be used to unlock the app.'
                  : 'You will be prompted to set a PIN.'}
              </Text>
            </View>
          )}
        </SettingsCard>

        {/* About */}
        <SectionLabel title="About" />
        <SettingsCard>
          <SettingsRow label="Version" right={<Text className="text-slate-400 text-xs">1.0.0</Text>} last />
        </SettingsCard>

      </ScrollView>
    </SafeAreaView>
  );
}