import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { readNfcTag, cancelNfc, NFC_CANCELLED, UNRECOGNIZED_TAG } from '../../services/nfc';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import NFCStatusPill, { NFCStatusPillRef } from './../../components/NFCStatusPill';

type ScanError = 'unrecognized' | 'failed';

export default function ReadNFC() {
  const navigation = useNavigation<any>();
  const sheetRef = useRef<NFCSheetRef>(null);
  const pillRef = useRef<NFCStatusPillRef>(null);
  const [error, setError] = useState<ScanError | null>(null);
  const mountedRef = useRef(true);
  // Set when our own ✕ button cancels — the pill's close animation handles
  // navigation then, so the cancelled read must not navigate too.
  const cancelledByPillRef = useRef(false);

  const startScan = useCallback(async () => {
    setError(null);
    cancelledByPillRef.current = false;
    try {
      const data = await readNfcTag();
      if (!mountedRef.current) return;
      if (data) {
        navigation.replace('NFCResult', { data });
      } else {
        setError('failed');
      }
    } catch (e) {
      if (!mountedRef.current) return;
      const code = e instanceof Error ? e.message : '';
      if (code === NFC_CANCELLED) {
        // Cancelled from the system NFC sheet (iOS) — just close.
        if (!cancelledByPillRef.current) navigation.goBack();
      } else if (code === UNRECOGNIZED_TAG) {
        setError('unrecognized');
      } else {
        setError('failed');
      }
    }
  }, [navigation]);

  useEffect(() => {
    mountedRef.current = true;
    startScan();
    return () => {
      mountedRef.current = false;
      cancelNfc();
    };
  }, [startScan]);

  function handlePillCancel() {
    cancelledByPillRef.current = true;
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
