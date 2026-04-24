import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import type { Report } from '../../types/responder';

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

function ReportCard({
  report,
  onPress,
  onStop,
  highlight = false,
}: {
  report: Report;
  onPress: () => void;
  onStop?: () => void;
  highlight?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl px-4 py-4 mb-3"
      style={{
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ? '#dc2626' : '#e2e8f0',
      }}
    >
      <View className="flex-row items-center mb-2">
        {highlight && <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />}
        <Text className="text-slate-800 text-base font-semibold flex-1">
          {report.name}
        </Text>
        {report.syncedToCloud ? (
          <View className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-0.5">
            <Text className="text-teal-700 text-[10px] font-bold">SYNCED</Text>
          </View>
        ) : (
          <View className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5">
            <Text className="text-slate-500 text-[10px] font-bold">LOCAL</Text>
          </View>
        )}
      </View>
      <Text className="text-slate-400 text-xs">
        {formatDate(report.date)} · {report.location}
      </Text>
      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-slate-600 text-sm">
          {report.entries.length} victim
          {report.entries.length === 1 ? '' : 's'} scanned
        </Text>
        {highlight && onStop && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onStop();
            }}
            className="bg-red-600 rounded-xl px-3 py-1.5"
          >
            <Text className="text-white text-xs font-bold">STOP</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const navigation = useNavigation<any>();
  const { getAllReports, deactivateReport, activeReport } = useApp();
  const [reports, setReports] = useState<Report[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const all = await getAllReports();
        if (!cancelled) setReports(all);
      })();
      return () => {
        cancelled = true;
      };
    }, [getAllReports, activeReport])
  );

  const active = reports.find((r) => r.isActive) ?? null;
  const past = reports
    .filter((r) => !r.isActive)
    .sort((a, b) => b.createdAt - a.createdAt);

  function onStop() {
    if (!active) return;
    Alert.alert(
      'Stop active report?',
      `"${active.name}" will be closed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            await deactivateReport();
            const all = await getAllReports();
            setReports(all);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between mt-6 mb-4">
          <Text className="text-slate-800 text-2xl font-bold">Reports</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('NewReport')}
            className="bg-teal-600 rounded-xl px-4 py-2 flex-row items-center"
          >
            <Text className="text-white text-base mr-1">＋</Text>
            <Text className="text-white text-sm font-bold">New</Text>
          </TouchableOpacity>
        </View>

        {active && (
          <View className="mb-4">
            <Text className="text-red-700 text-xs font-semibold uppercase tracking-widest mb-2">
              Active
            </Text>
            <ReportCard
              report={active}
              onPress={() =>
                navigation.navigate('ReportDetail', { reportId: active.id })
              }
              onStop={onStop}
              highlight
            />
          </View>
        )}

        <Text className="text-teal-700 text-xs font-semibold uppercase tracking-widest mb-2">
          {active ? 'Past Reports' : 'All Reports'}
        </Text>

        {past.length === 0 ? (
          <View className="bg-white border border-slate-100 rounded-2xl px-5 py-8 items-center">
            <Text className="text-slate-400 text-sm text-center">
              {active
                ? 'No past reports yet.'
                : 'No reports yet. Tap + New to start one.'}
            </Text>
          </View>
        ) : (
          past.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onPress={() =>
                navigation.navigate('ReportDetail', { reportId: r.id })
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
