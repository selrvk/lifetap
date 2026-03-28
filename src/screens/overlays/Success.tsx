import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function Success() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { message, subMessage } = route.params;

  return (
    <View className="flex-1 bg-black/60 items-center justify-end pb-10">
      <View className="bg-white w-full rounded-t-3xl p-8 items-center">
        <Text className="text-5xl mb-4">✅</Text>
        <Text className="text-2xl font-bold text-gray-800 mb-2">{message}</Text>
        {subMessage && (
          <Text className="text-gray-400 mb-8 text-center">{subMessage}</Text>
        )}
        <TouchableOpacity
          className="bg-blue-600 rounded-2xl px-8 py-4 mt-4"
          onPress={() => navigation.goBack()}
        >
          <Text className="text-white font-bold text-base">Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}