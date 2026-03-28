import 'react-native-url-polyfill/auto';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; // changed
import { View, Text } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AccountScreen from '../screens/AccountScreen';
import ReadNFCOverlay from '../screens/overlays/ReadNFC';
import WriteNFCOverlay from '../screens/overlays/WriteNFC';
import SyncOverlay from '../screens/overlays/Sync';
import SuccessOverlay from '../screens/overlays/Success';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator(); // changed

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠', Profile: '👤', Account: '⚙️',
  };
  return (
    <View className="items-center justify-center pt-1">
      <Text className={`text-xl ${focused ? 'opacity-100' : 'opacity-40'}`}>
        {icons[label]}
      </Text>
      <Text className={`text-xs mt-0.5 ${focused ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
        {label}
      </Text>
    </View>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 70,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
        },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
      <Tab.Screen name="Account" component={AccountScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Account" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen
          name="ReadNFC"
          component={ReadNFCOverlay}
          options={{ presentation: 'transparentModal' }}
        />
        <Stack.Screen
          name="WriteNFC"
          component={WriteNFCOverlay}
          options={{ presentation: 'transparentModal' }}
        />
        <Stack.Screen
          name="SyncOverlay"
          component={SyncOverlay}
          options={{ presentation: 'transparentModal' }}
        />
        <Stack.Screen
          name="Success"
          component={SuccessOverlay}
          options={{ presentation: 'transparentModal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}