import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { useApp } from '../../context/AppContext';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ResponderScanScreen() {
  const navigation = useNavigation<any>();
  const { activeReport, responderProfile, deactivateReport } = useApp();

  const recent = activeReport?.entries.slice(-5).reverse() ?? [];

  function onStopReport() {
    Alert.alert(
      'Stop active report?',
      `"${activeReport?.name}" will be closed. New scans will not be added to it.`,
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
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center mt-6 mb-4">
          <Text className="text-slate-400 text-xs uppercase tracking-widest">
            Responder
          </Text>
          <Text className="text-slate-800 text-xl font-semibold mt-1">
            {responderProfile?.full_name ?? 'Responder'}
          </Text>
          {responderProfile?.organization && (
            <Text className="text-slate-400 text-xs mt-0.5">
              {responderProfile.organization}
            </Text>
          )}
        </View>

        {/* Active report banner */}
        {activeReport ? (
          <View
            className="rounded-2xl px-5 py-4 mb-4 flex-row items-center"
            style={{
              backgroundColor: '#fef2f2',
              borderWidth: 2,
              borderColor: '#dc2626',
            }}
          >
            <View className="w-3 h-3 rounded-full bg-red-500 mr-3" />
            <View className="flex-1">
              <Text className="text-red-900 text-sm font-bold">
                {activeReport.name}
              </Text>
              <Text className="text-red-700 text-xs mt-0.5">
                {activeReport.entries.length} victim
                {activeReport.entries.length === 1 ? '' : 's'} ·{' '}
                {activeReport.location}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onStopReport}
              className="bg-red-600 rounded-xl px-3 py-2"
            >
              <Text className="text-white text-xs font-bold">STOP</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('NewReport')}
            activeOpacity={0.85}
            className="bg-white border border-teal-100 rounded-2xl flex-row items-center px-5 py-4 mb-4"
          >
            <View className="w-10 h-10 rounded-xl bg-teal-50 items-center justify-center mr-4">
              <Text className="text-teal-700 text-xl">＋</Text>
            </View>
            <View className="flex-1">
              <Text className="text-teal-700 text-base font-semibold">
                Start a new report
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                Group scans into a disaster report
              </Text>
            </View>
            <Text className="text-slate-300 text-lg">›</Text>
          </TouchableOpacity>
        )}

        {/* Scan button */}
        <TouchableOpacity
          className="rounded-3xl overflow-hidden mb-4 mt-4"
          style={{ height: 240 }}
          onPress={() => navigation.navigate('ReadNFC')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#0d9488', '#0f766e', '#134e4a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          >
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                style={{ width: 180, height: 180 }}
                resizeMode="contain"
                source={require('./../../../assets/icons/read-nfc-icon.png')}
              />
              <Text className="text-white text-2xl my-2 font-bold">
                Scan LifeTap Tag
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Recent scans */}
        {activeReport && (
          <View className="mt-4">
            <Text className="text-teal-700 text-xs font-semibold uppercase tracking-widest mb-2">
              Recent Scans
            </Text>
            {recent.length === 0 ? (
              <View className="bg-white border border-slate-100 rounded-2xl px-5 py-6 items-center">
                <Text className="text-slate-400 text-sm">
                  No scans yet in this report
                </Text>
              </View>
            ) : (
              <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                {recent.map((e, i) => (
                  <View
                    key={e.id + e.scannedAt}
                    className="flex-row items-center px-4 py-3"
                    style={
                      i !== recent.length - 1
                        ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' }
                        : undefined
                    }
                  >
                    <View className="w-9 h-9 rounded-xl bg-teal-50 items-center justify-center mr-3">
                      <Text className="text-teal-700 text-xs font-bold">
                        {e.bt || '?'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-700 text-sm font-semibold">
                        {e.n}
                      </Text>
                      <Text className="text-slate-400 text-xs mt-0.5">
                        Scanned at {formatTime(e.scannedAt)}
                        {e.smsSent ? ' · SMS sent' : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
