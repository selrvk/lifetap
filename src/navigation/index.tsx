import 'react-native-url-polyfill/auto';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Image } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AccountScreen from '../screens/SettingsScreen';
import ReadNFCOverlay from '../screens/overlays/ReadNFC';
import WriteNFCOverlay from '../screens/overlays/WriteNFC';
import SyncOverlay from '../screens/overlays/Sync';
import SuccessOverlay from '../screens/overlays/Success';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, any> = {
  Home:    require('./../../assets/icons/home-icon.png'),
  Profile: require('./../../assets/icons/profile-icon.png'),
  Account: require('./../../assets/icons/settings-icon.png'),
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
      borderRadius: 20,
      width: 60,
      height: 60,
      paddingHorizontal: 16,
      backgroundColor: focused ? '#ccfbf1' : 'transparent',
    }}>
      <Image
        source={TAB_ICONS[label]}
        style={{
          width: 70,
          height: 70,
        }}
        resizeMode="contain"
      />
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
          height: 80,
          paddingHorizontal: 16,
          backgroundColor: '#ffffff',
          borderTopWidth: 2,
          borderTopColor: '#f0fdfa', // teal-50
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -15 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
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