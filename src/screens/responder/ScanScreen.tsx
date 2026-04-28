import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { useApp } from '../../context/AppContext';

const RADIAL_SIZE = 320;
const BUTTON_SIZE = 210;
const OUTER_ORBIT = 308;
const INNER_ORBIT = 254;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ResponderScanScreen() {
  const navigation = useNavigation<any>();
  const { activeReport, responderProfile, deactivateReport } = useApp();

  const recent = activeReport?.entries.slice(-5).reverse() ?? [];

  const ping1 = useRef(new Animated.Value(0)).current;
  const ping2 = useRef(new Animated.Value(0)).current;
  const ping3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const orbitOuter = useRef(new Animated.Value(0)).current;
  const orbitInner = useRef(new Animated.Value(0)).current;
  const arc1 = useRef(new Animated.Value(0)).current;
  const arc2 = useRef(new Animated.Value(0)).current;
  const arc3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const PING_PERIOD = 2400;
    const ARC_PERIOD = 1800;
    const ITERATIONS = 1000;

    const makePingLoop = (val: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: PING_PERIOD, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const breatheAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    const makeOrbit = (val: Animated.Value, duration: number) =>
      Animated.timing(val, { toValue: ITERATIONS, duration: duration * ITERATIONS, easing: Easing.linear, useNativeDriver: true });

    const makeArcLoop = (val: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: ARC_PERIOD / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: ARC_PERIOD / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

    const orbitOuterAnim = makeOrbit(orbitOuter, 18000);
    const orbitInnerAnim = makeOrbit(orbitInner, 26000);

    breatheAnim.start();
    orbitOuterAnim.start();
    orbitInnerAnim.start();

    const p1 = makePingLoop(ping1);
    const p2 = makePingLoop(ping2);
    const p3 = makePingLoop(ping3);
    const a1 = makeArcLoop(arc1);
    const a2 = makeArcLoop(arc2);
    const a3 = makeArcLoop(arc3);

    p1.start();
    const t1 = setTimeout(() => p2.start(), PING_PERIOD / 3);
    const t2 = setTimeout(() => p3.start(), (PING_PERIOD / 3) * 2);
    a1.start();
    const t3 = setTimeout(() => a2.start(), ARC_PERIOD / 3);
    const t4 = setTimeout(() => a3.start(), (ARC_PERIOD / 3) * 2);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      [breatheAnim, orbitOuterAnim, orbitInnerAnim, p1, p2, p3, a1, a2, a3].forEach(a => a.stop());
    };
  }, [ping1, ping2, ping3, breathe, orbitOuter, orbitInner, arc1, arc2, arc3]);

  function onStopReport() {
    Alert.alert(
      'Stop active report?',
      `"${activeReport?.name}" will be closed. New scans will not be added to it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => deactivateReport() },
      ]
    );
  }

  const pingStyle = (val: Animated.Value) => ({
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  });

  const orbitRotate = (val: Animated.Value, reverse = false) => ({
    transform: [{
      rotate: Animated.modulo(val, 1).interpolate({
        inputRange: [0, 1],
        outputRange: reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'],
      }),
    }],
  });

  const breatheStyle = {
    transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
  };

  return (
    <SafeAreaView className="flex-1 bg-red-50">
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

        {/* Active report banner or start button */}
        {activeReport ? (
          <View
            className="rounded-2xl px-5 py-4 mb-2 flex-row items-center"
            style={{ backgroundColor: '#fef2f2', borderWidth: 2, borderColor: '#dc2626' }}
          >
            <View className="w-3 h-3 rounded-full bg-red-500 mr-3" />
            <View className="flex-1">
              <Text className="text-red-900 text-sm font-bold">{activeReport.name}</Text>
              <Text className="text-red-700 text-xs mt-0.5">
                {activeReport.entries.length} victim{activeReport.entries.length === 1 ? '' : 's'} · {activeReport.location}
              </Text>
            </View>
            <TouchableOpacity onPress={onStopReport} className="bg-red-600 rounded-xl px-3 py-2">
              <Text className="text-white text-xs font-bold">STOP</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('NewReport')}
            activeOpacity={0.85}
            className="bg-white border border-red-100 rounded-2xl flex-row items-center px-5 py-4 mb-2"
          >
            <View className="w-10 h-10 rounded-xl bg-red-50 items-center justify-center mr-4">
              <Text className="text-red-600 text-xl">＋</Text>
            </View>
            <View className="flex-1">
              <Text className="text-red-700 text-base font-semibold">Start a new report</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Group scans into a disaster report</Text>
            </View>
            <Text className="text-slate-300 text-lg">›</Text>
          </TouchableOpacity>
        )}

        {/* TAP TO SCAN label */}
        <Text
          className="text-center text-red-400 font-semibold mt-4"
          style={{ letterSpacing: 3, fontSize: 11 }}
        >
          TAP TO SCAN
        </Text>

        {/* Radial scanner */}
        <View style={{ alignItems: 'center', justifyContent: 'center', height: RADIAL_SIZE }}>
          {/* Ping rings */}
          {[ping1, ping2, ping3].map((p, i) => (
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
                  borderColor: '#dc2626',
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
                borderColor: '#dc262655',
                alignItems: 'center',
              },
              orbitRotate(orbitOuter),
            ]}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#dc2626', marginTop: -4 }} />
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
                borderColor: '#dc262640',
                alignItems: 'flex-end',
                justifyContent: 'center',
              },
              orbitRotate(orbitInner, true),
            ]}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#991b1b', marginRight: -3 }} />
          </Animated.View>

          {/* Central button */}
          <Animated.View style={breatheStyle}>
            <TouchableOpacity onPress={() => navigation.navigate('ReadNFC')} activeOpacity={0.85}>
              <LinearGradient
                colors={['#ef4444', '#dc2626', '#991b1b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: BUTTON_SIZE,
                  height: BUTTON_SIZE,
                  borderRadius: BUTTON_SIZE / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#7f1d1d',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                {/* NFC arcs top-right */}
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', top: 28, right: 28, width: 40, height: 40 }}
                >
                  {[arc1, arc2, arc3].map((a, i) => {
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
                          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.9] }),
                        }}
                      />
                    );
                  })}
                </View>

                <Image
                  style={{ width: 64, height: 64 }}
                  resizeMode="contain"
                  source={require('./../../../assets/lifetap-logo.png')}
                />
                <Text className="text-white text-lg font-bold mt-2">Scan LifeTap</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Text className="text-center text-red-300 text-xs px-6 mb-6" style={{ marginTop: -8 }}>
          Hold phone near a LifeTap tag{'\n'}to read victim medical information
        </Text>

        {/* Recent scans — always visible */}
        <View>
          <Text className="text-red-700 text-xs font-semibold uppercase tracking-widest mb-2">
            Recent Scans
          </Text>
          {recent.length === 0 ? (
            <View className="bg-white border border-red-100 rounded-2xl px-5 py-6 items-center">
              <Text className="text-slate-400 text-sm text-center">
                Recent report scans will appear here
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-2xl border border-red-100 overflow-hidden">
              {recent.map((e, i) => (
                <View
                  key={e.id + e.scannedAt}
                  className="flex-row items-center px-4 py-3"
                  style={i !== recent.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
                >
                  <View className="w-9 h-9 rounded-xl bg-red-50 items-center justify-center mr-3">
                    <Text className="text-red-700 text-xs font-bold">{e.bt || '?'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-700 text-sm font-semibold">{e.n}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      Scanned at {formatTime(e.scannedAt)}{e.smsSent ? ' · SMS sent' : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
