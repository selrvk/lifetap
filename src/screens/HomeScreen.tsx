import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

// Sync state type — we'll wire this to real data later
type SyncStatus = 'IN_SYNC' | 'TAG_BEHIND' | 'CLOUD_BEHIND' | 'NOT_SYNCED';

const SYNC_CONFIG: Record<SyncStatus, {
  bg: string;
  border: string;
  dot: string;
  label: string;
  sub: string;
  action?: string;
}> = {
  IN_SYNC: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
    label: 'LifeTap is up to date',
    sub: 'Tag and cloud are synced',
  },
  TAG_BEHIND: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    dot: 'bg-yellow-400',
    label: 'NFC tag is out of sync',
    sub: 'Your tag has older data',
    action: 'Write to LifeTap',
  },
  CLOUD_BEHIND: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-400',
    label: 'Cloud is out of sync',
    sub: 'Local data is newer than cloud',
    action: 'Upload to Cloud',
  },
  NOT_SYNCED: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-400',
    label: 'Not synced anywhere',
    sub: 'Write to tag and upload to cloud',
    action: 'Sync now',
  },
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();

  // Placeholder — will be replaced with real context data later
  const userName = 'Charles';
  const syncStatus: SyncStatus = 'TAG_BEHIND';
  const sync = SYNC_CONFIG[syncStatus];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Logo placeholder */}
        <View className="items-center mt-8 mb-6">
          <View className="w-24 h-24 rounded-full bg-blue-50 items-center justify-center border-2 border-blue-100">
            <Text className="text-4xl">❤️</Text>
          </View>
          <Text className="text-2xl font-bold text-blue-900 mt-3 tracking-tight">
            LifeTap
          </Text>
        </View>

        {/* Sync Status Card */}
        <View className={`rounded-2xl border p-4 mb-8 flex-row items-center ${sync.bg} ${sync.border}`}>
          <View className={`w-3 h-3 rounded-full mr-3 ${sync.dot}`} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-800">{sync.label}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{sync.sub}</Text>
          </View>
          {sync.action && (
            <TouchableOpacity className="bg-white rounded-xl px-3 py-1.5 border border-gray-200">
              <Text className="text-xs font-semibold text-blue-600">{sync.action}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Read LifeTap — Primary Big Button */}
        <TouchableOpacity
          className="bg-blue-600 rounded-3xl items-center justify-center mb-4"
          style={{ height: 140 }}
          onPress={() => navigation.navigate('ReadNFC')}
          activeOpacity={0.85}
        >
          <Text className="text-4xl mb-2">📡</Text>
          <Text className="text-white text-2xl font-bold tracking-tight">
            Read LifeTap
          </Text>
          <Text className="text-blue-200 text-sm mt-1">
            Tap to scan an NFC tag
          </Text>
        </TouchableOpacity>

        {/* Write to LifeTap */}
        <TouchableOpacity
          className="bg-white border border-gray-200 rounded-2xl flex-row items-center justify-center py-5 mb-3"
          onPress={() => navigation.navigate('WriteNFC')}
          activeOpacity={0.85}
        >
          <Text className="text-xl mr-3">✏️</Text>
          <Text className="text-gray-800 text-lg font-semibold">
            Write to LifeTap
          </Text>
        </TouchableOpacity>

        {/* Upload to Cloud */}
        <TouchableOpacity
          className="bg-white border border-gray-200 rounded-2xl flex-row items-center justify-center py-5"
          onPress={() => navigation.navigate('SyncOverlay')}
          activeOpacity={0.85}
        >
          <Text className="text-xl mr-3">☁️</Text>
          <Text className="text-gray-800 text-lg font-semibold">
            Upload to Cloud
          </Text>
        </TouchableOpacity>

        {/* Welcome message */}
        <View className="items-center mt-8">
          <Text className="text-gray-400 text-sm">Welcome back,</Text>
          <Text className="text-gray-700 text-base font-semibold">{userName}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}