import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { clearCloudSession } from '../../storage/asyncStorage';
import { useApp } from '../../context/AppContext';

function SectionLabel({ title }: { title: string }) {
  return (
    <Text className="text-teal-700 text-xs font-semibold uppercase tracking-widest mb-2 mt-5">
      {title}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View
      className="flex-row items-center px-4 py-3"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
    >
      <Text className="text-slate-500 text-sm flex-1">{label}</Text>
      <Text className="text-slate-700 text-sm font-semibold" numberOfLines={1}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

export default function ResponderSettingsScreen() {
  const {
    responderProfile,
    activeReport,
    deactivateReport,
    refreshSession,
  } = useApp();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    Alert.alert('Sign out?', 'You will be returned to civilian mode.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await supabase.auth.signOut();
            await clearCloudSession();
            await refreshSession();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  async function onStopActive() {
    if (!activeReport) return;
    Alert.alert(
      'Stop active report?',
      `"${activeReport.name}" will be closed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => deactivateReport(),
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
      >
        <Text className="text-slate-800 text-2xl font-bold mt-6 mb-2">
          Settings
        </Text>

        {/* Profile header */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 mt-3">
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="w-12 h-12 rounded-xl bg-teal-700 items-center justify-center">
              <Text className="text-white text-base font-semibold">
                {(responderProfile?.full_name ?? '?')
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-teal-900 text-base font-semibold">
                {responderProfile?.full_name ?? 'Responder'}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5 uppercase tracking-wider">
                {responderProfile?.role ?? '—'}
              </Text>
            </View>
          </View>
        </View>

        <SectionLabel title="Personnel Info" />
        <Card>
          <Row label="Phone" value={responderProfile?.phone} />
          <Row label="Badge No." value={responderProfile?.badge_no} />
          <Row label="Organization" value={responderProfile?.organization} />
          <Row label="City" value={responderProfile?.city} last />
        </Card>

        {activeReport && (
          <>
            <SectionLabel title="Active Report" />
            <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
              <Text className="text-red-900 text-sm font-bold">
                {activeReport.name}
              </Text>
              <Text className="text-red-700 text-xs mt-0.5">
                {activeReport.entries.length} victim
                {activeReport.entries.length === 1 ? '' : 's'} ·{' '}
                {activeReport.location}
              </Text>
              <TouchableOpacity
                onPress={onStopActive}
                className="bg-red-600 rounded-xl py-2 mt-3 items-center"
              >
                <Text className="text-white text-xs font-bold">
                  STOP REPORT
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <SectionLabel title="Session" />
        <Card>
          <TouchableOpacity
            onPress={onSignOut}
            disabled={signingOut}
            className="px-4 py-3 flex-row items-center"
          >
            <Text className="text-red-600 text-sm font-semibold flex-1">
              Sign Out
            </Text>
            {signingOut ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text className="text-slate-300 text-lg">›</Text>
            )}
          </TouchableOpacity>
        </Card>

        <Text className="text-slate-300 text-xs text-center mt-8">
          LifeTap · Responder Mode
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
