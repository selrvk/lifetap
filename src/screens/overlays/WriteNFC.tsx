import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function RippleRing({ delay, size }: { delay: number; size: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: '#0d9488',
        opacity: anim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.8, 0] }),
      }}
    />
  );
}

function BouncingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(600),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0f766e',
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    />
  );
}

export default function WriteNFC() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-black/60 items-center justify-end">
      <View
        className="bg-white w-full rounded-t-3xl p-8 items-center"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Ripple animation */}
        <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 40, marginTop: 20 }}>
          <RippleRing delay={0}   size={120} />
          <RippleRing delay={100} size={140} />
          <RippleRing delay={200} size={160} />

          <View style={{
            width: 100,
            height: 100,
            borderRadius: 80,
            backgroundColor: '#30726c',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            <Image
              source={require('./../../../assets/icons/write-nfc.png')}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
            />
          </View>
        </View>

        <Text className="text-lg font-semibold text-teal-900 mb-1">Writing to LifeTap</Text>
        <Text className="text-sm text-slate-400 mb-6">Hold your phone near the NFC tag</Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
          <BouncingDot delay={0} />
          <BouncingDot delay={200} />
          <BouncingDot delay={400} />
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}