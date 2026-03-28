import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-gray-800">Profile</Text>
        <Text className="text-gray-400 mt-1">Medical details go here</Text>
      </View>
    </SafeAreaView>
  );
}