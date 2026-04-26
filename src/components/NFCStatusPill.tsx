import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  label: string;
  onCancel: () => void;
};

export type NFCStatusPillRef = {
  close: (cb?: () => void) => void;
};

const NFCStatusPill = forwardRef<NFCStatusPillRef, Props>(({ label, onCancel }, ref) => {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-120)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    close: (cb) => {
      Animated.timing(slide, {
        toValue: -120,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => cb?.());
    },
  }));

  useEffect(() => {
    Animated.spring(slide, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.3] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          transform: [{ translateY: slide }],
        }}
      >
        <View
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 999,
            paddingVertical: 12,
            paddingLeft: 18,
            paddingRight: 8,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#0A4A43',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 14,
            elevation: 8,
            borderWidth: 1,
            borderColor: '#ccfbf1',
          }}
        >
          {/* Pulsing dot */}
          <View style={{ width: 12, height: 12, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#14857A',
                opacity: dotOpacity,
                transform: [{ scale: dotScale }],
              }}
            />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0f766e' }} />
          </View>

          <Text
            style={{ flex: 1, color: '#0A4A43', fontSize: 14, fontWeight: '600' }}
            numberOfLines={1}
          >
            {label}
          </Text>

          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: '#f1f5f9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="Cancel scan"
          >
            <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '700', marginTop: Platform.OS === 'ios' ? -1 : -2 }}>
              ✕
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
});

export default NFCStatusPill;
