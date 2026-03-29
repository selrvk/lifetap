import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {
  getLocalUser,
  getSyncStatus,
  SyncStatus,
} from '../storage/asyncStorage';

const SYNC_CONFIG: Record<SyncStatus, {
  label: string;
  sub: string;
  action?: string;
  actionBg: string;
  navigateTo?: string;
}> = {
  IN_SYNC: {
    label: 'LifeTap is up to date',
    sub: 'Tag and cloud are synced',
    actionBg: 'bg-teal-500',
  },
  TAG_BEHIND: {
    label: 'NFC tag is out of date',
    sub: 'Your local data is newer than the tag',
    action: 'WRITE TO LIFETAP',
    actionBg: 'bg-teal-600',
    navigateTo: 'WriteNFC',
  },
  CLOUD_BEHIND: {
    label: 'Cloud is out of sync',
    sub: 'Local data is newer than cloud',
    action: 'UPLOAD TO CLOUD',
    actionBg: 'bg-teal-600',
    navigateTo: 'SyncOverlay',
  },
  NOT_SYNCED: {
    label: 'Not synced anywhere',
    sub: 'Write to tag and upload to cloud',
    action: 'SYNC NOW',
    actionBg: 'bg-red-500',
    navigateTo: 'WriteNFC',
  },
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [userName, setUserName] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('IN_SYNC');
  const [hasUser, setHasUser] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [user, status] = await Promise.all([
          getLocalUser(),
          getSyncStatus(),
        ]);

        if (user) {
          setHasUser(true);
          setUserName(user.n.split(' ')[0]);
          setSyncStatus(status);
        } else {
          setHasUser(false);
          setUserName(null);
        }
      }
      load();
    }, [])
  );

  const sync = SYNC_CONFIG[syncStatus];

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Logo */}
        <View className="items-center mt-6 mb-5">
          <Image
            className="w-40 h-40"
            source={require('./../../assets/lifetap-logo-w-label.png')}
          />
        </View>

        {/* Welcome — or no profile banner */}
        {hasUser ? (
          <View className="items-center mt-4">
            <Text className="text-gray-400 text-sm">Welcome back,</Text>
            <Text className="text-gray-700 text-base font-semibold text-xl">
              {userName}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
          >
            <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mt-4 flex-row items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-100 items-center justify-center mr-3">
                <Text className="text-base">👤</Text>
              </View>
              <View className="flex-1">
                <Text className="text-amber-800 text-sm font-semibold">
                  No profile set up
                </Text>
                <Text className="text-amber-600 text-xs mt-0.5">
                  Tap to set up your LifeTap profile
                </Text>
              </View>
              <Text className="text-amber-400 text-lg">›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Read LifeTap — always available */}
        <TouchableOpacity
          className="rounded-3xl overflow-hidden mb-4 mt-10"
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
            <View className="absolute top-4 right-4 opacity-40">
              <Text className="text-white text-lg">↻</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                style={{ width: 180, height: 180 }}
                resizeMode="contain"
                source={require('./../../assets/icons/read-nfc-icon.png')}
              />

              <Text className='text-white text-2xl my-2 font-bold'>
                Read LifeTap
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Write to LifeTap — only if user exists */}
        {hasUser && (
          <TouchableOpacity
            className="bg-white border border-teal-100 rounded-2xl flex-row items-center px-5 py-4 mb-3"
            onPress={() => navigation.navigate('WriteNFC')}
            activeOpacity={0.85}
          >
            <View className="w-10 h-10 rounded-xl bg-teal-50 items-center justify-center mr-4">
              <Text className="text-xl">✏️</Text>
            </View>
            <Text className="text-teal-700 text-lg font-semibold">
              Write to LifeTap
            </Text>
          </TouchableOpacity>
        )}

        {/* Sync and Upload to Cloud — only if user exists */}
        {hasUser && (
          <TouchableOpacity
            className="bg-white border border-teal-100 rounded-2xl flex-row items-center px-5 py-4"
            onPress={() => navigation.navigate('SyncOverlay')}
            activeOpacity={0.85}
          >
            <View className="w-10 h-10 rounded-xl bg-teal-50 items-center justify-center mr-4">
              <Text className="text-xl">☁️</Text>
            </View>
            <Text className="text-teal-700 text-lg font-semibold">
              Sync and Upload to Cloud
            </Text>
          </TouchableOpacity>
        )}

        {/* Sync Status Card — only if user exists */}
        {hasUser && (
          <View
            className="bg-white rounded-2xl px-4 py-3 mb-4 flex-row items-center mt-4"
            style={{
              borderWidth: 2,
              borderColor: syncStatus === 'NOT_SYNCED' ? '#dc2626' : '#0f766e',
            }}
          >
            <Text className="text-xl mr-3">🔄</Text>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-800">{sync.label}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{sync.sub}</Text>
            </View>
            {sync.action && sync.navigateTo && (
              <TouchableOpacity
                className={`${sync.actionBg} rounded-xl px-3 py-2`}
                onPress={() => navigation.navigate(sync.navigateTo!)}
              >
                <Text className="text-xs font-bold text-white">{sync.action}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}