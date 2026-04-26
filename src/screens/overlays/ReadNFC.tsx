import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { readNfcTag, cancelNfc } from '../../services/nfc';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import NFCStatusPill, { NFCStatusPillRef } from './../../components/NFCStatusPill';
import { useApp } from '../../context/AppContext';

type ScanError = 'unrecognized' | 'failed';

export default function ReadNFC() {
  const navigation = useNavigation<any>();
  const sheetRef = useRef<NFCSheetRef>(null);
  const pillRef = useRef<NFCStatusPillRef>(null);
  const { activeReport } = useApp();
  const [error, setError] = useState<ScanError | null>(null);

  useEffect(() => {
    startScan();
    return () => { cancelNfc(); };
  }, []);

  async function startScan() {
    setError(null);
    try {
      const data = await readNfcTag();
      if (data) {
        navigation.replace('NFCResult', {
          data,
          fromReport: activeReport?.name ?? null,
        });
      } else {
        setError('failed');
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'UNRECOGNIZED_TAG') {
        setError('unrecognized');
      } else {
        setError('failed');
      }
    }
  }

  function handlePillCancel() {
    cancelNfc();
    pillRef.current?.close(() => navigation.goBack());
  }

  if (error) {
    const isUnrecognized = error === 'unrecognized';
    return (
      <NFCSheet ref={sheetRef} onClose={() => navigation.goBack()}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 20 }}>
          <Text style={{ fontSize: 36 }}>❌</Text>
        </View>
        <Text className="text-lg font-semibold text-teal-900 mb-1">
          {isUnrecognized ? 'Unrecognized Tag' : 'Scan Failed'}
        </Text>
        <Text className="text-sm text-slate-400 mb-8 text-center">
          {isUnrecognized
            ? "This doesn't appear to be a LifeTap tag."
            : 'Could not read the tag. Hold your phone steady and try again.'}
        </Text>
        <TouchableOpacity
          onPress={startScan}
          className="bg-teal-600 w-full rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => sheetRef.current?.close()}>
          <Text className="text-red-400 font-semibold text-sm">Close</Text>
        </TouchableOpacity>
      </NFCSheet>
    );
  }

  return (
    <NFCStatusPill
      ref={pillRef}
      label="Reading LifeTap…"
      onCancel={handlePillCancel}
    />
  );
}
