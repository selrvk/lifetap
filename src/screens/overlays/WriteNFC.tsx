import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function WriteNFC() {
  const navigation = useNavigation();
  return (
    <View className="flex-1 bg-black/60 items-center justify-end pb-10">
      <View className="bg-white w-full rounded-t-3xl p-8 items-center">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Updating LifeTap</Text>
        <Text className="text-gray-400 mb-8">Hold your phone near the NFC tag</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text className="text-red-400 font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}