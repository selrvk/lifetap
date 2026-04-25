import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import { RippleRing, BouncingDot } from './../../components/NFCanimations';
import { supabase } from '../../lib/supabase';
import {
  getLocalUser,
  updateLocalUser,
  getCloudSession,
  markSyncedToCloud,
  overwriteLocalUserFromCloud,
  LocalUser,
} from '../../storage/asyncStorage';

type SyncStep =
  | 'comparing'
  | 'in_sync'
  | 'local_newer'
  | 'cloud_newer'
  | 'uploading'
  | 'pulling'
  | 'success'
  | 'error';

// ─────────────────────────────────────────────
// COMPARING STEP
// ─────────────────────────────────────────────
function ComparingStep({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <View style={{
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        marginTop: 8,
      }}>
        <RippleRing delay={0}   size={120} color="#3b82f6" />
        <RippleRing delay={500} size={140} color="#3b82f6" />
        <RippleRing delay={1000} size={160} color="#3b82f6" />

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

      <Text className="text-lg font-semibold text-blue-900 mb-1">
        Comparing with Cloud
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        Checking your local data against Supabase
      </Text>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
        <BouncingDot delay={0}   color="#2563eb" />
        <BouncingDot delay={200} color="#2563eb" />
        <BouncingDot delay={400} color="#2563eb" />
      </View>

      <TouchableOpacity onPress={onCancel}>
        <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </>
  );
}

// ─────────────────────────────────────────────
// WORKING STEP (uploading or pulling)
// ─────────────────────────────────────────────
function WorkingStep({ label, sub }: { label: string; sub: string }) {
  return (
    <>
      <View style={{
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        marginTop: 8,
      }}>
        <RippleRing delay={0}   size={120} color="#3b82f6" />
        <RippleRing delay={500} size={140} color="#3b82f6" />
        <RippleRing delay={1000} size={160} color="#3b82f6" />

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

      <Text className="text-lg font-semibold text-blue-900 mb-1">{label}</Text>
      <Text className="text-sm text-slate-400 mb-6">{sub}</Text>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
        <BouncingDot delay={0}   color="#2563eb" />
        <BouncingDot delay={200} color="#2563eb" />
        <BouncingDot delay={400} color="#2563eb" />
      </View>
    </>
  );
}

// ─────────────────────────────────────────────
// RESULT STEP
// ─────────────────────────────────────────────
function ResultStep({
  step,
  localUser,
  cloudUpdatedAt,
  onUpload,
  onPull,
  onDone,
  onCancel,
}: {
  step: SyncStep;
  localUser: LocalUser | null;
  cloudUpdatedAt: string | null;
  onUpload: () => void;
  onPull: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  if (step === 'in_sync') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-blue-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>✅</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Already in Sync</Text>
        <Text className="text-slate-400 text-sm mb-8 text-center">
          Your local data matches the cloud. Nothing to do.
        </Text>
        <TouchableOpacity
          onPress={onDone}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Done</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (step === 'local_newer') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-amber-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>⬆️</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Local is Newer</Text>
        <Text className="text-slate-400 text-sm mb-5 text-center">
          Your app has newer data than the cloud. Upload to update Supabase.
        </Text>

        {/* Diff summary */}
        <View className="w-full bg-blue-50 rounded-2xl p-4 mb-6">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-400">Local modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {localUser
                ? new Date(localUser.lastModified).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-400">Cloud modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {cloudUpdatedAt
                ? new Date(cloudUpdatedAt).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })
                : 'No cloud record'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onUpload}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Upload to Cloud</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (step === 'cloud_newer') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-blue-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>⬇️</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Cloud is Newer</Text>
        <Text className="text-slate-400 text-sm mb-5 text-center">
          The cloud has newer data than your app. Pull to update locally.
        </Text>

        {/* Diff summary */}
        <View className="w-full bg-blue-50 rounded-2xl p-4 mb-6">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-400">Local modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {localUser
                ? new Date(localUser.lastModified).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-400">Cloud modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {cloudUpdatedAt
                ? new Date(cloudUpdatedAt).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onPull}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Pull from Cloud</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-red-400 font-semibold text-sm">Cancel</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (step === 'success') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-blue-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>✅</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Sync Complete</Text>
        <Text className="text-slate-400 text-sm mb-8 text-center">
          Your data is now in sync with the cloud.
        </Text>
        <TouchableOpacity
          onPress={onDone}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Done</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (step === 'error') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-red-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>❌</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Sync Failed</Text>
        <Text className="text-slate-400 text-sm mb-8 text-center">
          Something went wrong. Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={onDone}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-red-400 font-semibold text-sm">Close</Text>
        </TouchableOpacity>
      </>
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

export default function SyncOverlay() {
  const navigation = useNavigation();
  const sheetRef = useRef<NFCSheetRef>(null);
  const [step, setStep] = useState<SyncStep>('comparing');
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);

  function close() {
    sheetRef.current?.close();
  }

  // Auto-run comparison on mount
  useEffect(() => {
    compare();
  }, []);

  async function compare() {
    setStep('comparing');

    const [user, session] = await Promise.all([
      getLocalUser(),
      getCloudSession(),
    ]);

    if (!user || !session) {
      setStep('error');
      return;
    }

    setLocalUser(user);

    // Fetch cloud record
    const { data, error } = await supabase
      .from('users')
      .select('updated_at')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (first upload)
      setStep('error');
      return;
    }

    if (!data) {
      // No cloud record yet — local is always newer
      setCloudUpdatedAt(null);
      setStep('local_newer');
      return;
    }

    setCloudUpdatedAt(data.updated_at);

    const localTime = user.lastModified;
    const cloudTime = new Date(data.updated_at).getTime();

    const diffMs = Math.abs(localTime - cloudTime);

    if (diffMs < 5000) {
      // Within 5 seconds — consider in sync
      setStep('in_sync');
    } else if (localTime > cloudTime) {
      setStep('local_newer');
    } else {
      setStep('cloud_newer');
    }
  }

  async function handleUpload() {
    if (!localUser) return;
    setStep('uploading');

    const session = await getCloudSession();
    if (!session) { setStep('error'); return; }

    // If this account already owns a cloud profile with a different id (e.g. user
    // cleared local data and re-onboarded), adopt the existing cloud id so the
    // upsert updates that row instead of violating the owner_id unique constraint.
    let profileId = localUser.id;
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('owner_id', session.user_id)
      .maybeSingle();

    if (existing && existing.id !== localUser.id) {
      profileId = existing.id;
      await updateLocalUser({ id: profileId } as any);
    }

    const { error } = await supabase
      .from('users')
      .upsert({
        id: profileId,
        n: localUser.n,
        dob: localUser.dob,
        bt: localUser.bt,
        brg: localUser.brg,
        cty: localUser.cty,
        phn: localUser.phn,
        rel: localUser.rel,
        od: localUser.od,
        a: localUser.a,
        c: localUser.c,
        meds: localUser.meds,
        kin: localUser.kin,
        is_public: localUser.is_public,
        owner_id: session.user_id,
        updated_at: new Date(localUser.lastModified).toISOString(),
      });

    if (error) {
      console.error('Upload error:', error.message);
      setStep('error');
      return;
    }

    await markSyncedToCloud();
    setStep('success');
  }

  async function handlePull() {
    if (!localUser) return;
    setStep('pulling');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', localUser.id)
      .single();

    if (error || !data) {
      setStep('error');
      return;
    }

    await overwriteLocalUserFromCloud({
      ...data,
      lastModified: new Date(data.updated_at).getTime(),
      syncedToTag: false,
      syncedToCloud: true,
    });

    setStep('success');
  }

  return (
    <NFCSheet ref={sheetRef} onClose={() => navigation.goBack()}>
      {step === 'comparing' && (
        <ComparingStep onCancel={close} />
      )}

      {step === 'uploading' && (
        <WorkingStep
          label="Uploading to Cloud"
          sub="Saving your local data to Supabase"
        />
      )}

      {step === 'pulling' && (
        <WorkingStep
          label="Pulling from Cloud"
          sub="Updating your local data from Supabase"
        />
      )}

      {(step === 'in_sync' ||
        step === 'local_newer' ||
        step === 'cloud_newer' ||
        step === 'success' ||
        step === 'error') && (
        <ResultStep
          step={step}
          localUser={localUser}
          cloudUpdatedAt={cloudUpdatedAt}
          onUpload={handleUpload}
          onPull={handlePull}
          onDone={step === 'error' ? compare : close}
          onCancel={close}
        />
      )}
    </NFCSheet>
  );
}