import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet'; 
import { RippleRing, BouncingDot } from './../../components/NFCanimations';

export default function ReadNFC() {
  const navigation = useNavigation();
  // 2. Create the ref
  const sheetRef = useRef<NFCSheetRef>(null);

  return (
    <NFCSheet ref={sheetRef} onClose={() => navigation.goBack()}>
      <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 40, marginTop: 20 }}>
        <RippleRing delay={0}   size={120} />
        <RippleRing delay={100} size={140} />
        <RippleRing delay={200} size={160} />
        <View style={{
          width: 100, height: 100, borderRadius: 80,
          backgroundColor: '#30726c', alignItems: 'center',
          justifyContent: 'center', zIndex: 10,
        }}>
          <Image
            source={require('./../../../assets/lifetap-logo.png')}
            style={{ width: 80, height: 80 }}
            resizeMode="contain"
          />
        </View>
      </View>

      <Text className="text-lg font-semibold text-teal-900 mb-1">Reading LifeTap</Text>
      <Text className="text-sm text-slate-400 mb-6">Hold your phone near the NFC tag</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
        <BouncingDot delay={0} />
        <BouncingDot delay={200} />
        <BouncingDot delay={400} />
      </View>

      {/* 4. Update the onPress to call the sheet's internal close method */}
      <TouchableOpacity onPress={() => sheetRef.current?.close()}>
        <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </NFCSheet>
  );
}