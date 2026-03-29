import 'react-native-url-polyfill/auto';
import React, { useRef, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Image, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AccountScreen from '../screens/SettingsScreen';
import ReadNFCOverlay from '../screens/overlays/ReadNFC';
import WriteNFCOverlay from '../screens/overlays/WriteNFC';
import SyncOverlay from '../screens/overlays/Sync';
import SuccessOverlay from '../screens/overlays/Success';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const CIRCLE_SIZE = 54; // defined at module level so StyleSheet can use it

const TAB_ICONS: Record<string, any> = {
  Profile: require('./../../assets/icons/profile.png'),
  Home:    require('./../../assets/icons/home.png'),
  Account: require('./../../assets/icons/settings.png'),
};

// ─────────────────────────────────────────────
// CUSTOM TAB BAR
// ─────────────────────────────────────────────

function CustomTabBar({ state, descriptors, navigation }: any) {
  const tabCount = state.routes.length;
  const animatedValue = useRef(new Animated.Value(state.index)).current;
  const [barWidth, setBarWidth] = useState(0); // ← moved inside component

  const BAR_PADDING = 16;
  const USABLE_WIDTH = barWidth - BAR_PADDING * 2;
  const TAB_WIDTH = USABLE_WIDTH / tabCount;
  const centerOffset = BAR_PADDING + (TAB_WIDTH - CIRCLE_SIZE) / 2;

  useEffect(() => {
    if (barWidth === 0) return;
    Animated.spring(animatedValue, {
      toValue: state.index,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
  }, [state.index, barWidth]);

  const translateX = barWidth === 0
  ? new Animated.Value(0)
  : animatedValue.interpolate({
      inputRange: state.routes.map((_: any, i: number) => i),
      outputRange: state.routes.map((_: any, i: number) => (i * TAB_WIDTH) + centerOffset),
    });

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.bar}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Sliding circle indicator */}
        {barWidth > 0 && (
          <Animated.View
            style={[
              styles.slidingCircle,
              { transform: [{ translateX }] },
            ]}
          >
            <View style={styles.circle} />
          </Animated.View>
        )}

        {/* Tab buttons */}
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.8}
              style={styles.tab}
            >
              <Image
                source={TAB_ICONS[route.name]}
                style={{
                  width: route.name === 'Home' ? 32 : 28,
                  height: route.name === 'Home' ? 32 : 28,
                  tintColor: focused ? '#ffffff' : '#94a3b8',
                }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    height: 68,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 10,
  },
  slidingCircle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#0d9488',
  },
});

// ─────────────────────────────────────────────
// TAB NAVIGATOR
// ─────────────────────────────────────────────

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

// ─────────────────────────────────────────────
// ROOT NAVIGATOR
// ─────────────────────────────────────────────

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="ReadNFC" component={ReadNFCOverlay}
          options={{ presentation: 'transparentModal' }} />
        <Stack.Screen name="WriteNFC" component={WriteNFCOverlay}
          options={{ presentation: 'transparentModal' }} />
        <Stack.Screen name="SyncOverlay" component={SyncOverlay}
          options={{ presentation: 'transparentModal' }} />
        <Stack.Screen name="Success" component={SuccessOverlay}
          options={{ presentation: 'transparentModal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}