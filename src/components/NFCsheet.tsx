import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  onClose: () => void;
  children: React.ReactNode;
};

// 1. Define the type for the methods we are exposing
export type NFCSheetRef = {
  close: () => void;
};

// 2. Wrap the component in forwardRef
const NFCSheet = forwardRef<NFCSheetRef, Props>(({ onClose, children }, ref) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  // 3. Expose the handleClose function to the parent via the ref
  useImperativeHandle(ref, () => ({
    close: handleClose,
  }));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function handleClose() {
    Animated.parallel([
      Animated.timing(bgAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'black',
            opacity: bgAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.6],
            }),
          },
        ]}
      />
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleClose}
      />
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 32,
          paddingTop: 32,
          paddingBottom: insets.bottom + 24,
          alignItems: 'center',
          transform: [{ translateY: slideAnim }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
});

export default NFCSheet;