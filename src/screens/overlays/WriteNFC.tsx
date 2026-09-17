import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getLocalUser,
  saveLocalUser,
  markSyncedToTag,
  hasCurrentConsent,
  LocalUser,
} from '../../storage/asyncStorage';
import {
  writeNfcTag,
  eraseNfcTag,
  cancelNfc,
  tagBytesNeeded,
  NFC_CANCELLED,
  NTAG216_CAPACITY,
  TagProfile,
  TagWriteResult,
} from '../../services/nfc';

function tagProfileOf(u: LocalUser): TagProfile {
  return {
    id: u.id, n: u.n, dob: u.dob, bt: u.bt, brg: u.brg, cty: u.cty, phn: u.phn,
    rel: u.rel, od: u.od, a: u.a, c: u.c, meds: u.meds, kin: u.kin,
    is_public: u.is_public,
    sms: u.consent?.smsAlerts === true,
    lastModified: u.lastModified,
  };
}

// User-facing message for a failed write (null = generic message).
function failureMessage(r: Exclude<TagWriteResult, { ok: true }>): string | null {
  switch (r.reason) {
    case 'too_large':
      return `Your profile needs ${r.needed} bytes but this tag only holds ${r.capacity}. ` +
        'Shorten some entries (for example, medications) or use an NTAG216 tag.';
    case 'locked':
      return 'This tag is password-locked by another app, so LifeTap can’t write to it.';
    case 'unsupported':
      return 'This isn’t a supported tag. LifeTap uses NTAG213, NTAG215 or NTAG216 tags.';
    case 'not_ndef':
      return 'This tag isn’t formatted for NFC data. Try a different LifeTap tag.';
    case 'read_only':
      return 'This tag is permanently read-only and can’t be written.';
    case 'not_configured':
      return 'Tag encryption isn’t set up in this build of the app (missing tag keys).';
    default:
      return null;
  }
}
import NFCSheet, { NFCSheetRef } from './../../components/NFCsheet';
import NFCStatusPill, { NFCStatusPillRef } from './../../components/NFCStatusPill';

type Mode = 'write' | 'erase';

function ConfirmStep({
  user,
  onConfirm,
  onCancel,
}: {
  user: LocalUser;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const needed = tagBytesNeeded(tagProfileOf(user));
  const tooBig = needed !== null && needed > NTAG216_CAPACITY;
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-6 self-center" />
      <Text className="text-teal-900 text-lg font-bold mb-1">Write to LifeTap</Text>
      <Text className="text-slate-400 text-sm mb-2">
        The following data will be written to your tag
      </Text>
      {needed !== null && (
        <Text
          className="text-xs mb-4"
          style={{ color: tooBig ? '#dc2626' : '#94a3b8' }}
        >
          {tooBig
            ? `Too large: needs ${needed} of ${NTAG216_CAPACITY} bytes. Shorten some entries first.`
            : `Uses ${needed} of ${NTAG216_CAPACITY} bytes on an NTAG216 tag`}
        </Text>
      )}

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
              : '🔒  In LifeTap, civilians see name & blood type only'}
          </Text>
          <Text style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            {user.consent?.smsAlerts
              ? '📱  Responders may text your emergency contacts'
              : '📵  Responders won’t text your emergency contacts'}
          </Text>
          <Text style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            {user.is_public
              ? '🔐  Encrypted — readable only with the LifeTap app'
              : '🔐  Encrypted — only responders can read your medical details'}
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={onConfirm}
        disabled={tooBig}
        className="bg-teal-600 w-full rounded-2xl py-4 items-center mb-3"
        style={{ opacity: tooBig ? 0.5 : 1 }}
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

function ConfirmEraseStep({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-6 self-center" />
      <Text className="text-teal-900 text-lg font-bold mb-1">Erase LifeTap tag</Text>
      <Text className="text-slate-400 text-sm mb-6 text-center leading-5">
        This removes all profile and medical information from the tag you hold
        to your phone. Responders won’t be able to read anything from it until
        you write it again.
      </Text>
      <TouchableOpacity
        onPress={onConfirm}
        className="w-full rounded-2xl py-4 items-center mb-3"
        style={{ backgroundColor: '#dc2626' }}
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">Erase Tag</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel}>
        <Text className="text-slate-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </>
  );
}

// Profiles need current consent before anything is written to a tag.
function NeedsConsentStep({ onClose }: { onClose: () => void }) {
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-6 self-center" />
      <Text className="text-teal-900 text-lg font-bold mb-1">Review the privacy notice first</Text>
      <Text className="text-slate-400 text-sm mb-6 text-center leading-5">
        Open the Profile tab to review and accept how LifeTap uses your data,
        then come back to write your tag.
      </Text>
      <TouchableOpacity
        onPress={onClose}
        className="bg-teal-600 w-full rounded-2xl py-4 items-center"
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">OK</Text>
      </TouchableOpacity>
    </>
  );
}

// The tag holds another LifeTap profile or other data — confirm before
// replacing it (a second tap writes with force).
// ownerKnown: false when erasing with no profile on the phone (after it was
// deleted). The app can't tell then whether the tag is the user's own, so it
// says so instead of calling it "someone else's". Deliberately not solved by
// remembering the deleted profile's id: withdrawing consent erases it.
function ConfirmOverwriteStep({
  mode,
  kind,
  ownerKnown,
  onConfirm,
  onTryAnother,
  onCancel,
}: {
  mode: Mode;
  kind: 'lifetap' | 'other';
  ownerKnown: boolean;
  onConfirm: () => void;
  onTryAnother: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View className="w-12 h-1 bg-slate-200 rounded-full mb-6 self-center" />
      <View className="w-20 h-20 rounded-full items-center justify-center mb-5 bg-amber-50">
        <Text style={{ fontSize: 36 }}>⚠️</Text>
      </View>
      <Text className="text-teal-900 text-lg font-bold mb-1 text-center">
        {kind === 'other'
          ? 'This tag already has data'
          : ownerKnown
            ? 'This is someone else’s LifeTap'
            : 'This tag holds a LifeTap profile'}
      </Text>
      <Text className="text-slate-400 text-sm mb-6 text-center leading-5">
        {kind === 'other'
          ? 'It holds data from another app. '
          : ownerKnown
            ? 'It holds a different person’s LifeTap profile. '
            : 'This phone no longer has a profile to compare it with, so make sure the tag is yours. '}
        {mode === 'erase'
          ? 'Erase it anyway? You’ll need to hold it to your phone again.'
          : 'Replace it with your profile? You’ll need to hold it to your phone again.'}
      </Text>
      <TouchableOpacity
        onPress={onConfirm}
        className="w-full rounded-2xl py-4 items-center mb-3"
        style={{ backgroundColor: '#d97706' }}
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold">
          {mode === 'erase' ? 'Erase Anyway' : 'Replace It'}
        </Text>
      </TouchableOpacity>
      {/* Back to the start, keeping this screen's context (e.g. the owner id
          passed in after a deletion) — closing would lose it. */}
      <TouchableOpacity
        onPress={onTryAnother}
        className="w-full rounded-2xl py-4 items-center mb-3 border border-slate-200"
        activeOpacity={0.85}
      >
        <Text className="text-slate-600 font-semibold">Use a Different Tag</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel}>
        <Text className="text-slate-400 font-semibold text-sm">Cancel</Text>
      </TouchableOpacity>
    </>
  );
}

function ResultStep({
  mode,
  success,
  message,
  onDone,
  onCancel,
}: {
  mode: Mode;
  success: boolean;
  message?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const erase = mode === 'erase';
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
        {success
          ? (erase ? 'Tag Erased' : 'Tag Updated')
          : (erase ? 'Erase Failed' : 'Write Failed')}
      </Text>
      <Text className="text-slate-400 text-sm mb-8 text-center">
        {success
          ? (erase
              ? 'The tag no longer holds any information and is unlocked.'
              : 'Your LifeTap tag has been updated, encrypted and write-protected.')
          : message ?? 'Something went wrong. Make sure the tag is held steady and try again.'}
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

type Step = 'loading' | 'confirm' | 'scanning' | 'overwrite' | 'success' | 'error';

export default function WriteNFC() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const mode: Mode = route.params?.mode === 'erase' ? 'erase' : 'write';
  const ownIdParam: string | undefined = route.params?.ownId;
  const [step, setStep] = useState<Step>('loading');
  const [user, setUser] = useState<LocalUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [foreignKind, setForeignKind] = useState<'lifetap' | 'other'>('other');

  const sheetRef = useRef<NFCSheetRef>(null);
  const pillRef = useRef<NFCStatusPillRef>(null);
  const mountedRef = useRef(true);
  const cancelledByPillRef = useRef(false);

  useEffect(() => {
    async function load() {
      const data = await getLocalUser();
      if (!mountedRef.current) return;
      setUser(data);
      setStep('confirm');
    }
    load();
    return () => { mountedRef.current = false; };
  }, []);

  // force = the user confirmed replacing someone else's tag / other data.
  async function handleWrite(force = false) {
    if (mode === 'write' && (!user || !hasCurrentConsent(user))) return;
    cancelledByPillRef.current = false;
    setErrorMessage(null);
    setStep('scanning');

    let result: TagWriteResult;
    try {
      result = mode === 'erase'
        ? await eraseNfcTag({ ownId: user?.id ?? ownIdParam, force })
        : await writeNfcTag(tagProfileOf(user!), { force });
    } catch (e) {
      if (e instanceof Error && e.message === NFC_CANCELLED) {
        // Our ✕ button already closes the overlay; a cancel from the system
        // NFC sheet (iOS) goes back to the confirm step instead of "failed".
        if (!cancelledByPillRef.current && mountedRef.current) setStep('confirm');
        return;
      }
      result = { ok: false, reason: 'failed' };
    }
    if (!mountedRef.current) return;

    if (result.ok) {
      if (mode === 'write') {
        await markSyncedToTag(result.responderKeyId ?? 1);
      } else if (user) {
        // The profile still exists on the phone but no longer on a tag.
        await saveLocalUser({ ...user, syncedToTag: false });
      }
      setStep('success');
    } else if (result.reason === 'foreign') {
      setForeignKind(result.kind);
      setStep('overwrite');
    } else {
      setErrorMessage(failureMessage(result));
      setStep('error');
    }
  }

  function triggerClose() {
    sheetRef.current?.close();
  }

  function pillCancel() {
    cancelledByPillRef.current = true;
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

  if (step === 'loading') return null;

  if (step === 'scanning') {
    return (
      <NFCStatusPill
        ref={pillRef}
        label={mode === 'erase' ? 'Erasing LifeTap…' : 'Writing to LifeTap…'}
        onCancel={pillCancel}
      />
    );
  }

  let content: React.ReactNode;
  if (step === 'success' || step === 'error') {
    content = (
      <ResultStep
        mode={mode}
        success={step === 'success'}
        message={errorMessage}
        onDone={handleDone}
        onCancel={triggerClose}
      />
    );
  } else if (step === 'overwrite') {
    content = (
      <ConfirmOverwriteStep
        mode={mode}
        kind={foreignKind}
        ownerKnown={mode === 'write' || !!(user?.id ?? ownIdParam)}
        onConfirm={() => handleWrite(true)}
        onTryAnother={() => setStep('confirm')}
        onCancel={triggerClose}
      />
    );
  } else if (mode === 'erase') {
    content = <ConfirmEraseStep onConfirm={() => handleWrite()} onCancel={triggerClose} />;
  } else if (!user) {
    content = (
      <>
        <Text className="text-slate-400 text-sm mb-4">No local profile found.</Text>
        <TouchableOpacity onPress={triggerClose}>
          <Text className="text-red-400 font-semibold text-sm">Close</Text>
        </TouchableOpacity>
      </>
    );
  } else if (!hasCurrentConsent(user)) {
    content = <NeedsConsentStep onClose={triggerClose} />;
  } else {
    content = <ConfirmStep user={user} onConfirm={() => handleWrite()} onCancel={triggerClose} />;
  }

  return (
    <NFCSheet ref={sheetRef} onClose={finalizeClose}>
      {content}
    </NFCSheet>
  );
}
