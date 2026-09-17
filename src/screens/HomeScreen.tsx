import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {
  getLocalUser,
  syncStatusOf,
  getCloudSession,
  SyncStatus,
  CloudSession,
} from '../storage/asyncStorage';
import { currentResponderKeyId } from '../crypto/keys';
import { useScannerAnimation } from '../hooks/useScannerAnimation';

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
    // Also fires for tags in an older (unencrypted or pre-rotation) format.
    sub: 'Write your latest info to your tag',
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

const RADIAL_SIZE = 330;
const BUTTON_SIZE = 220;
const OUTER_ORBIT = 320;
const INNER_ORBIT = 265;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [userName, setUserName] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('IN_SYNC');
  const [hasUser, setHasUser] = useState<boolean>(false);
  const [session, setSession] = useState<CloudSession | null>(null);

  const { pings, arcs, orbitOuter, orbitInner, pingStyle, orbitRotate, breatheStyle } =
    useScannerAnimation();

  useFocusEffect(
    useCallback(() => {
      async function load() {
        // One read each: Keychain round trips are slow enough to notice when
        // this runs on every return to the tab.
        const [user, cloudSession] = await Promise.all([
          getLocalUser(),
          getCloudSession(),
        ]);

        setSession(cloudSession);

        if (user) {
          setHasUser(true);
          setUserName(user.n.split(' ')[0]);
          setSyncStatus(syncStatusOf(user, cloudSession !== null, currentResponderKeyId()));
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
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingBottom: 100,
        }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mt-3 mb-1">
          <Image
            style={{ height: 28, width: 100 }}
            resizeMode="contain"
            source={require('./../../assets/lifetap-w-label-landscape.png')}
          />
          {hasUser ? (
            <Text className="text-gray-500 text-sm">
              Welcome back, <Text className="text-gray-800 font-semibold">{userName}</Text>
            </Text>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.8}
              className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex-row items-center"
            >
              <Text className="text-amber-700 text-xs font-semibold mr-1">
                No profile
              </Text>
              <Text className="text-amber-400 text-base">›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Radial scanner */}
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            className="text-gray-400 font-semibold mb-4"
            style={{ letterSpacing: 3, fontSize: 11 }}
          >
            TAP TO SCAN
          </Text>
          <View
            style={{
              width: RADIAL_SIZE,
              height: RADIAL_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
          {/* Ping rings */}
          {pings.map((p, i) => (
            <Animated.View
              key={`ping-${i}`}
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  width: BUTTON_SIZE,
                  height: BUTTON_SIZE,
                  borderRadius: BUTTON_SIZE / 2,
                  borderWidth: 2,
                  borderColor: '#14857A',
                },
                pingStyle(p),
              ]}
            />
          ))}

          {/* Outer dashed orbit */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: OUTER_ORBIT,
                height: OUTER_ORBIT,
                borderRadius: OUTER_ORBIT / 2,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#14857A55',
                alignItems: 'center',
              },
              orbitRotate(orbitOuter),
            ]}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#14857A',
                marginTop: -4,
              }}
            />
          </Animated.View>

          {/* Inner dashed orbit */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: INNER_ORBIT,
                height: INNER_ORBIT,
                borderRadius: INNER_ORBIT / 2,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#14857A40',
                alignItems: 'flex-end',
                justifyContent: 'center',
              },
              orbitRotate(orbitInner, true),
            ]}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: '#0A4A43',
                marginRight: -3,
              }}
            />
          </Animated.View>

          {/* Central button */}
          <Animated.View style={breatheStyle}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ReadNFC')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#14857A', '#0A4A43']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: BUTTON_SIZE,
                  height: BUTTON_SIZE,
                  borderRadius: BUTTON_SIZE / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#0A4A43',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.35,
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                {/* NFC arcs top-right */}
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 28,
                    right: 28,
                    width: 40,
                    height: 40,
                  }}
                >
                  {arcs.map((a, i) => {
                    const size = 14 + i * 10;
                    return (
                      <Animated.View
                        key={`arc-${i}`}
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          width: size,
                          height: size,
                          borderTopRightRadius: size,
                          borderTopWidth: 2,
                          borderRightWidth: 2,
                          borderColor: '#ffffff',
                          opacity: a.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.2, 0.9],
                          }),
                        }}
                      />
                    );
                  })}
                </View>

                <Image
                  style={{ width: 70, height: 70 }}
                  resizeMode="contain"
                  source={require('./../../assets/lifetap-logo.png')}
                />
                <Text className="text-white text-lg font-bold mt-2">
                  Read LifeTap
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
          </View>
        </View>

        {/* Subtext */}
        <Text className="text-center text-gray-400 text-xs px-6 mb-4" style={{ marginTop: -48 }}>
          Hold phone near a LifeTap tag{'\n'}to read medical information
        </Text>

        {/* Secondary actions grid */}
        {hasUser && (() => {
          const writeAccent = syncStatus === 'TAG_BEHIND' || syncStatus === 'NOT_SYNCED';
          const syncAccent = syncStatus === 'CLOUD_BEHIND' || syncStatus === 'NOT_SYNCED';
          const cardShadow = {
            shadowColor: '#0A4A43',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          };
          const accentBorder = {
            borderLeftWidth: 3,
            borderLeftColor: '#14857A',
          };
          return (
          <View className="flex-row mb-2" style={{ gap: 12 }}>
            <TouchableOpacity
              className="flex-1 bg-white rounded-2xl px-4 py-4"
              style={[cardShadow, writeAccent ? accentBorder : null]}
              onPress={() => navigation.navigate('WriteNFC')}
              activeOpacity={0.85}
            >
              <View className="w-9 h-9 rounded-xl bg-teal-50 items-center justify-center mb-3">
                <Image
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain"
                  source={require('./../../assets/icons/pencil-icon.png')}
                />
              </View>
              <Text className="text-gray-800 text-base font-bold">
                Write to tag
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">
                Update my info
              </Text>
            </TouchableOpacity>

            {session ? (
              <TouchableOpacity
                className="flex-1 bg-white rounded-2xl px-4 py-4"
                style={[cardShadow, syncAccent ? accentBorder : null]}
                onPress={() => navigation.navigate('SyncOverlay')}
                activeOpacity={0.85}
              >
                <View className="w-9 h-9 rounded-xl bg-teal-50 items-center justify-center mb-3">
                  <Image
                    style={{ width: 20, height: 20 }}
                    resizeMode="contain"
                    source={require('./../../assets/icons/cloud-icon.png')}
                  />
                </View>
                <Text className="text-gray-800 text-base font-bold">
                  Sync cloud
                </Text>
                <Text
                  className={
                    syncStatus === 'IN_SYNC'
                      ? 'text-gray-400 text-xs mt-0.5'
                      : 'text-amber-600 text-xs mt-0.5 font-semibold'
                  }
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {syncStatus === 'IN_SYNC' ? 'Up to date' : sync.sub}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="flex-1 bg-white rounded-2xl px-4 py-4"
                style={cardShadow}
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.85}
              >
                <View className="w-9 h-9 rounded-xl bg-slate-100 items-center justify-center mb-3">
                  <Image
                    style={{ width: 20, height: 20, opacity: 0.5 }}
                    resizeMode="contain"
                    source={require('./../../assets/icons/cloud-icon.png')}
                  />
                </View>
                <Text className="text-gray-800 text-base font-bold">
                  Sync cloud
                </Text>
                <View className="flex-row items-center mt-0.5 flex-wrap">
                  <Text className="text-gray-400 text-xs mr-1.5">Sign in</Text>
                  <View className="bg-teal-50 border border-teal-200 rounded-md px-1.5 py-0.5">
                    <Text className="text-teal-700 text-[10px] font-bold">
                      LOGIN
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
          );
        })()}

        {/* Sync Status Card — only if user exists and not in sync */}
        {hasUser && syncStatus !== 'IN_SYNC' && (
          <View
            className="bg-white rounded-2xl px-4 py-3 mt-2 flex-row items-center"
            style={{
              borderWidth: 1,
              borderColor: syncStatus === 'NOT_SYNCED' ? '#fecaca' : '#a7f3d0',
            }}
          >
            <Image
              style={{ width: 22, height: 22, marginRight: 12 }}
              resizeMode="contain"
              source={require('./../../assets/icons/refresh-icon.png')}
            />
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-800">{sync.label}</Text>
              <Text className="text-[11px] text-gray-400 mt-0.5">{sync.sub}</Text>
            </View>
            {sync.action && sync.navigateTo && (
              <TouchableOpacity
                className={`${sync.actionBg} rounded-lg px-2.5 py-1.5`}
                onPress={() => navigation.navigate(sync.navigateTo!)}
              >
                <Text className="text-[10px] font-bold text-white">{sync.action}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}
