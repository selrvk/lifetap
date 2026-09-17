import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import { RippleRing, BouncingDot } from './../../components/NFCanimations';
import { supabase } from '../../lib/supabase';
import ConsentCheckbox from './../../components/ConsentCheckbox';
import {
  getLocalUser,
  updateLocalUser,
  getCloudSession,
  markSyncedToCloud,
  overwriteLocalUserFromCloud,
  saveConsentOnly,
  hasCurrentConsent,
  LocalUser,
} from '../../storage/asyncStorage';
import { cloudRowFromProfile, profileFromCloudRow } from '../../services/cloudProfile';

type SyncStep =
  | 'needs_consent'
  | 'comparing'
  | 'in_sync'
  | 'local_newer'
  | 'cloud_newer'
  // The account's cloud profile isn't the one on this phone (e.g. local data
  // was cleared and a new profile created). The user picks which to keep.
  | 'different_profile'
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
function formatWhen(value: number | string | null | undefined): string {
  if (value == null) return '—';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Just-in-time consent: cloud backup is optional and asked only before an upload.
function BackupConsent({
  localUser,
  checked,
  onChange,
}: {
  localUser: LocalUser | null;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  if (localUser?.consent?.cloudBackup) return null;
  return (
    <View className="w-full bg-white border border-slate-100 rounded-2xl px-4 mb-4">
      <ConsentCheckbox
        checked={checked}
        onChange={onChange}
        required
        label={
          'Back up my profile, including medical information, to LifeTap Cloud ' +
          '(Supabase, hosted in Sydney, Australia). Authorized personnel for my ' +
          'city can view it in the LifeTap dashboard.'
        }
      />
    </View>
  );
}

function ResultStep({
  step,
  localUser,
  cloudUpdatedAt,
  cloudName,
  backupConsent,
  onBackupConsentChange,
  onUpload,
  onPull,
  onDone,
  onCancel,
}: {
  step: SyncStep;
  localUser: LocalUser | null;
  cloudUpdatedAt: string | null;
  cloudName: string | null;
  backupConsent: boolean;
  onBackupConsentChange: (v: boolean) => void;
  onUpload: () => void;
  onPull: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  if (step === 'needs_consent') {
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-amber-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>📄</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1">Review the privacy notice first</Text>
        <Text className="text-slate-400 text-sm mb-8 text-center leading-5">
          Open the Profile tab to review and accept how LifeTap uses your data,
          then come back to sync.
        </Text>
        <TouchableOpacity
          onPress={onCancel}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">OK</Text>
        </TouchableOpacity>
      </>
    );
  }

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
              {formatWhen(localUser?.lastModified)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-400">Cloud modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {cloudUpdatedAt ? formatWhen(cloudUpdatedAt) : 'No cloud record'}
            </Text>
          </View>
        </View>

        <BackupConsent
          localUser={localUser}
          checked={backupConsent}
          onChange={onBackupConsentChange}
        />

        <TouchableOpacity
          onPress={onUpload}
          disabled={!localUser?.consent?.cloudBackup && !backupConsent}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center mb-3"
          style={{ opacity: !localUser?.consent?.cloudBackup && !backupConsent ? 0.5 : 1 }}
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

  if (step === 'different_profile') {
    const uploadBlocked = !localUser?.consent?.cloudBackup && !backupConsent;
    return (
      <>
        <View className="w-20 h-20 rounded-full bg-amber-50 items-center justify-center mb-5">
          <Text style={{ fontSize: 36 }}>⚠️</Text>
        </View>
        <Text className="text-blue-900 text-lg font-bold mb-1 text-center">
          Your account has a different profile
        </Text>
        <Text className="text-slate-400 text-sm mb-5 text-center leading-5">
          This account already has a LifeTap profile in the cloud, and it isn’t the one on
          this phone. Choose which one to keep — the other is replaced.
        </Text>

        <View className="w-full bg-blue-50 rounded-2xl p-4 mb-5">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-400">On this phone</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {localUser?.n || '—'} · {formatWhen(localUser?.lastModified)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-400">In the cloud</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {cloudName || '—'} · {formatWhen(cloudUpdatedAt)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onPull}
          className="w-full bg-blue-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Use the Cloud Profile</Text>
        </TouchableOpacity>

        <BackupConsent
          localUser={localUser}
          checked={backupConsent}
          onChange={onBackupConsentChange}
        />
        <TouchableOpacity
          onPress={onUpload}
          disabled={uploadBlocked}
          className="w-full bg-white border border-blue-200 rounded-2xl py-4 items-center mb-3"
          style={{ opacity: uploadBlocked ? 0.5 : 1 }}
          activeOpacity={0.85}
        >
          <Text className="text-blue-700 font-semibold">Replace It With This Phone’s</Text>
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
              {formatWhen(localUser?.lastModified)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-slate-400">Cloud modified</Text>
            <Text className="text-xs text-slate-700 font-semibold">
              {formatWhen(cloudUpdatedAt)}
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
  const [cloudName, setCloudName] = useState<string | null>(null);
  const [backupConsent, setBackupConsent] = useState(false);

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

    if (!hasCurrentConsent(user)) {
      setStep('needs_consent');
      return;
    }

    // The account's cloud profile, looked up by owner — the same row an upload
    // would write to. Looking it up by this phone's profile id reported "no
    // cloud record" for an account that had one under another id, and the
    // upload then silently replaced it.
    const { data, error } = await supabase
      .from('users')
      .select('id, n, updated_at')
      .eq('owner_id', session.user_id)
      .maybeSingle();

    if (error) {
      setStep('error');
      return;
    }

    if (!data) {
      // No cloud record yet — local is always newer
      setCloudUpdatedAt(null);
      setCloudName(null);
      setStep('local_newer');
      return;
    }

    setCloudUpdatedAt(data.updated_at);
    setCloudName(data.n ?? null);

    if (data.id !== user.id) {
      setStep('different_profile');
      return;
    }

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
    if (!localUser?.consent) return;
    const needsBackupConsent = !localUser.consent.cloudBackup;
    if (needsBackupConsent && !backupConsent) return;
    setStep('uploading');

    const session = await getCloudSession();
    if (!session) { setStep('error'); return; }

    // Record the just-in-time cloud-backup consent before anything is uploaded.
    // Not a profile edit, so it doesn't bump lastModified or touch the tag.
    let uploadUser: LocalUser = localUser;
    if (needsBackupConsent) {
      const now = Date.now();
      const consent = { ...localUser.consent, cloudBackup: true, cloudBackupAt: now, updatedAt: now };
      uploadUser = { ...localUser, consent };
      await saveConsentOnly(consent);
    }

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
      // Upload what was just saved: updateLocalUser stamps a new lastModified,
      // and uploading the older one would leave the cloud row permanently
      // "behind" the phone, so every later check said local was newer.
      const adopted = await updateLocalUser({ id: profileId } as any);
      if (adopted) uploadUser = adopted;
    }

    const { error } = await supabase
      .from('users')
      .upsert(cloudRowFromProfile(uploadUser, profileId, session.user_id));

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

    const session = await getCloudSession();
    if (!session) { setStep('error'); return; }

    // By owner, like compare(): also covers taking the account's cloud profile
    // in place of a different one on this phone.
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('owner_id', session.user_id)
      .maybeSingle();

    if (error || !data) {
      setStep('error');
      return;
    }

    // Consent belongs to the person, not to a data version: keep whichever
    // record is more recent, so pulling an older cloud row can't undo a
    // consent choice made on this phone.
    const pulled = profileFromCloudRow(data);
    const local = localUser.consent;
    const consent =
      pulled.consent && (!local || pulled.consent.updatedAt >= local.updatedAt)
        ? pulled.consent
        : local;
    await overwriteLocalUserFromCloud({ ...pulled, consent });

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

      {(step === 'needs_consent' ||
        step === 'in_sync' ||
        step === 'local_newer' ||
        step === 'cloud_newer' ||
        step === 'different_profile' ||
        step === 'success' ||
        step === 'error') && (
        <ResultStep
          step={step}
          localUser={localUser}
          cloudUpdatedAt={cloudUpdatedAt}
          cloudName={cloudName}
          backupConsent={backupConsent}
          onBackupConsentChange={setBackupConsent}
          onUpload={handleUpload}
          onPull={handlePull}
          onDone={step === 'error' ? compare : close}
          onCancel={close}
        />
      )}
    </NFCSheet>
  );
}