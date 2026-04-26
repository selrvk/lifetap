import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getLocalUser, markSyncedToTag, LocalUser } from '../../storage/asyncStorage';
import { writeNfcTag, cancelNfc } from '../../services/nfc';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import NFCStatusPill, { NFCStatusPillRef } from './../../components/NFCStatusPill';

function ConfirmStep({
  user,
  onConfirm,
  onCancel,
}: {
  user: LocalUser;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-6 self-center" />
      <Text className="text-teal-900 text-lg font-bold mb-1">Write to LifeTap</Text>
      <Text className="text-slate-400 text-sm mb-5">
        The following data will be written to your tag
      </Text>

      <ScrollView
        className="w-full mb-5"
        style={{ maxHeight: 260 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="bg-teal-50 rounded-2xl p-4 mb-3">
          <Text className="text-teal-700 text-xs font-semibold uppercase tracking-wider mb-2">
            Identity
          </Text>
          <Text className="text-slate-700 text-sm font-semibold">{user.n}</Text>
          <Text className="text-slate-400 text-xs mt-0.5">
            {user.bt} · {user.dob} · {user.rel}
          </Text>
          <Text className="text-slate-400 text-xs mt-0.5">
            {user.brg}, {user.cty}
          </Text>
          {user.od && (
            <View className="bg-teal-100 rounded-lg px-2 py-0.5 self-start mt-2">
              <Text className="text-teal-700 text-xs font-semibold">Organ Donor</Text>
            </View>
          )}
        </View>

        <View className="bg-teal-50 rounded-2xl p-4 mb-3">
          <Text className="text-teal-700 text-xs font-semibold uppercase tracking-wider mb-2">
            Medical
          </Text>
          <Text className="text-slate-500 text-xs">
            Allergies: {user.a.length > 0 ? user.a.join(', ') : 'None'}
          </Text>
          <Text className="text-slate-500 text-xs mt-1">
            Conditions: {user.c.length > 0 ? user.c.join(', ') : 'None'}
          </Text>
          <Text className="text-slate-500 text-xs mt-1">
            Medications: {user.meds.length > 0 ? user.meds.join(', ') : 'None'}
          </Text>
        </View>

        <View className="bg-teal-50 rounded-2xl p-4 mb-3">
          <Text className="text-teal-700 text-xs font-semibold uppercase tracking-wider mb-2">
            Emergency Contacts
          </Text>
          {user.kin.length === 0
            ? <Text className="text-slate-400 text-xs">None</Text>
            : user.kin.map((k, i) => (
                <Text key={i} className="text-slate-500 text-xs mt-0.5">
                  {k.n} ({k.r}) · {k.p}
                </Text>
              ))
          }
        </View>

        <View
          className="rounded-2xl p-3 mb-1"
          style={{
            backgroundColor: user.is_public ? '#f0fdfa' : '#fefce8',
            borderWidth: 1,
            borderColor: user.is_public ? '#99f6e4' : '#fde68a',
          }}
        >
          <Text style={{ fontSize: 11, color: user.is_public ? '#0f766e' : '#92400e' }}>
            {user.is_public
              ? '🌐  Full profile visible to anyone who scans this tag'
              : '🔒  Civilians see name & blood type only'}
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={onConfirm}
        className="bg-teal-600 w-full rounded-2xl py-4 items-center mb-3"
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">Write to LifeTap</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel}>
        <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </>
  );
}

function ResultStep({
  success,
  onDone,
  onCancel,
}: {
  success: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-8 self-center" />

      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: success ? '#f0fdfa' : '#fef2f2' }}
      >
        <Text style={{ fontSize: 36 }}>{success ? '✅' : '❌'}</Text>
      </View>

      <Text className="text-teal-900 text-lg font-bold mb-1">
        {success ? 'Tag Updated' : 'Write Failed'}
      </Text>
      <Text className="text-slate-400 text-sm mb-8 text-center">
        {success
          ? 'Your LifeTap tag has been successfully updated with your latest info.'
          : 'Something went wrong. Make sure the tag is held steady and try again.'}
      </Text>

      <TouchableOpacity
        onPress={onDone}
        className="w-full rounded-2xl py-4 items-center mb-3"
        style={{ backgroundColor: '#0f766e' }}
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">
          {success ? 'Done' : 'Try Again'}
        </Text>
      </TouchableOpacity>

      {!success && (
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-red-400 font-semibold text-sm">Close</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

type Step = 'confirm' | 'scanning' | 'success' | 'error';

export default function WriteNFC() {
  const navigation = useNavigation();
  const [step, setStep] = useState<Step>('confirm');
  const [user, setUser] = useState<LocalUser | null>(null);
  
  const sheetRef = useRef<NFCSheetRef>(null);
  const pillRef = useRef<NFCStatusPillRef>(null);

  useEffect(() => {
    async function load() {
      const data = await getLocalUser();
      setUser(data);
    }
    load();
  }, []);

  async function handleWrite() {
    if (!user) return;
    setStep('scanning');

    const payload = {
      id: user.id,
      n: user.n,
      dob: user.dob,
      bt: user.bt,
      brg: user.brg,
      cty: user.cty,
      phn: user.phn,
      rel: user.rel,
      od: user.od,
      a: user.a,
      c: user.c,
      meds: user.meds,
      kin: user.kin,
      is_public: user.is_public,
      lastModified: user.lastModified,
    };

    const success = await writeNfcTag(payload);

    if (success) {
      await markSyncedToTag();
      setStep('success');
    } else {
      setStep('error');
    }
  }

  function triggerClose() {
    sheetRef.current?.close();
  }

  function pillCancel() {
    cancelNfc();
    pillRef.current?.close(() => navigation.goBack());
  }

  async function finalizeClose() {
    await cancelNfc();
    navigation.goBack();
  }

  function handleDone() {
    if (step === 'error') {
      handleWrite();
    } else {
      triggerClose(); 
    }
  }

  if (step === 'scanning') {
    return (
      <NFCStatusPill
        ref={pillRef}
        label="Writing to LifeTap…"
        onCancel={pillCancel}
      />
    );
  }

  return (
    <NFCSheet ref={sheetRef} onClose={finalizeClose}>
      {!user && step === 'confirm' ? (
        <>
          <Text className="text-slate-400 text-sm mb-4">No local profile found.</Text>
          <TouchableOpacity onPress={triggerClose}>
            <Text className="text-red-400 font-semibold text-sm">Close</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {step === 'confirm' && user && (
            <ConfirmStep
              user={user}
              onConfirm={handleWrite}
              onCancel={triggerClose}
            />
          )}
          {(step === 'success' || step === 'error') && (
            <ResultStep
              success={step === 'success'}
              onDone={handleDone}
              onCancel={triggerClose}
            />
          )}
        </>
      )}
    </NFCSheet>
  );
}