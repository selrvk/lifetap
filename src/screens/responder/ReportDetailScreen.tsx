import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { getReportById } from '../../storage/asyncStorage';
import { syncReportToCloud } from '../../services/reports';
import type { Report, ReportEntry } from '../../types/responder';

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return s;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-PH', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function ReportDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { reportId } = route.params ?? {};
  const { setActiveReport, activeReport } = useApp();

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const r = await getReportById(reportId);
    setReport(r);
    setLoading(false);
  }, [reportId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function onSetActive() {
    if (!report) return;
    await setActiveReport(report);
    await load();
  }

  async function onSync() {
    if (!report) return;
    setSyncing(true);
    const res = await syncReportToCloud(report);
    setSyncing(false);
    if (res.ok) {
      Alert.alert('Synced', 'Report uploaded to cloud.');
      await load();
    } else {
      Alert.alert('Sync failed', res.error ?? 'Unknown error');
    }
  }

  function onViewVictim(entry: ReportEntry) {
    navigation.navigate('NFCResult', {
      data: {
        id: entry.id,
        n: entry.n,
        bt: entry.bt,
        dob: entry.dob,
        a: entry.a,
        c: entry.c,
        meds: entry.meds,
        kin: entry.kin,
        // fields not captured in ReportEntry — provide safe fallbacks
        brg: '',
        cty: report?.location ?? '',
        phn: '',
        rel: '—',
        od: false,
        is_public: true,
      },
      fromReport: report?.name ?? null,
      viewOnly: true,
    });
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <ActivityIndicator color="#0f766e" />
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center px-6">
        <Text className="text-slate-600 text-base">Report not found.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="bg-white border border-slate-200 rounded-xl px-4 py-2 mt-4"
        >
          <Text className="text-slate-600 text-sm font-semibold">← Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isActive = activeReport?.id === report.id;

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
      >
        {/* Top bar */}
        <View className="flex-row items-center mt-6 mb-4">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 mr-3"
          >
            <Text className="text-slate-600 text-sm font-semibold">← Back</Text>
          </TouchableOpacity>
          {isActive && (
            <View className="bg-red-600 rounded-xl px-3 py-1.5">
              <Text className="text-white text-xs font-bold">● ACTIVE</Text>
            </View>
          )}
          <View className="flex-1" />
          {report.syncedToCloud ? (
            <View className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
              <Text className="text-teal-700 text-[10px] font-bold">SYNCED</Text>
            </View>
          ) : (
            <View className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
              <Text className="text-slate-500 text-[10px] font-bold">LOCAL</Text>
            </View>
          )}
        </View>

        {/* Header card */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
          <Text className="text-slate-800 text-xl font-bold">{report.name}</Text>
          <Text className="text-slate-400 text-xs mt-1">
            {formatDate(report.date)} · {report.location}
          </Text>
          <View className="h-px bg-slate-100 my-3" />
          <Text className="text-slate-400 text-xs uppercase tracking-widest mb-1">
            Responder
          </Text>
          <Text className="text-slate-700 text-sm">{report.responderName}</Text>
          <Text className="text-slate-400 text-xs mt-2">
            {report.entries.length} victim
            {report.entries.length === 1 ? '' : 's'} scanned
          </Text>
        </View>

        {/* Actions */}
        <View className="flex-row mb-4" style={{ gap: 8 }}>
          {!isActive && (
            <TouchableOpacity
              onPress={onSetActive}
              className="flex-1 bg-white border border-teal-200 rounded-2xl py-3 items-center"
            >
              <Text className="text-teal-700 text-sm font-bold">
                SET AS ACTIVE
              </Text>
            </TouchableOpacity>
          )}
          {!report.syncedToCloud && (
            <TouchableOpacity
              onPress={onSync}
              disabled={syncing}
              className="flex-1 bg-teal-600 rounded-2xl py-3 items-center justify-center"
              style={{ opacity: syncing ? 0.6 : 1 }}
            >
              {syncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-sm font-bold">
                  SYNC TO CLOUD
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Victims */}
        <Text className="text-teal-700 text-xs font-semibold uppercase tracking-widest mb-2">
          Victims
        </Text>

        {report.entries.length === 0 ? (
          <View className="bg-white border border-slate-100 rounded-2xl px-5 py-8 items-center">
            <Text className="text-slate-400 text-sm">
              No victims scanned yet.
            </Text>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {report.entries.map((e, i) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => onViewVictim(e)}
                className="flex-row items-center px-4 py-3"
                style={
                  i !== report.entries.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }
                    : undefined
                }
              >
                <View className="w-10 h-10 rounded-xl bg-teal-50 items-center justify-center mr-3">
                  <Text className="text-teal-700 text-xs font-bold">
                    {e.bt || '?'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-700 text-sm font-semibold">
                    {e.n}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">
                    Scanned {formatTime(e.scannedAt)}
                    {e.smsSent ? ' · ✓ SMS sent' : ''}
                  </Text>
                </View>
                <Text className="text-slate-300 text-lg">›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
