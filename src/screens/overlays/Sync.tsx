import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import { RippleRing, BouncingDot } from './../../components/NFCanimations';

export default function SyncOverlay() {
  const navigation = useNavigation();
  const sheetRef = useRef<NFCSheetRef>(null);

  function triggerClose() {
    sheetRef.current?.close();
  }

  return (
    <NFCSheet ref={sheetRef} onClose={() => navigation.goBack()}>
      <View style={{
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        marginTop: 20,
      }}>
        <RippleRing delay={0}   size={120} color="#3b82f6" />
        <RippleRing delay={100} size={140} color="#3b82f6" />
        <RippleRing delay={200} size={160} color="#3b82f6" />

        <View style={{
          width: 100,
          height: 100,
          borderRadius: 80,
          backgroundColor: '#1d4ed8',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <Image
            source={require('./../../../assets/icons/upload-to-cloud.png')}
            style={{ width: 80, height: 80 }}
            resizeMode="contain"
          />
        </View>
      </View>

      <Text className="text-lg font-semibold text-blue-900 mb-1">Syncing with Cloud</Text>
      <Text className="text-sm text-slate-400 mb-6">Comparing local data with Supabase</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
        <BouncingDot delay={0}   color="#2563eb" />
        <BouncingDot delay={200} color="#2563eb" />
        <BouncingDot delay={400} color="#2563eb" />
      </View>

      <TouchableOpacity onPress={triggerClose}>
        <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </NFCSheet>
  );
}