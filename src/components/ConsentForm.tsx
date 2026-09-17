import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import ConsentCheckbox from './ConsentCheckbox';
import PrivacyNoticeModal from './PrivacyNoticeModal';
import { NOTICE_SUMMARY, PRIVACY_NOTICE_VERSION } from '../legal/privacyNotice';
import type { ConsentRecord } from '../storage/asyncStorage';

// The consent step shared by onboarding, the "updated notice" screen, and
// Settings → Privacy & Consent. Layered notice first (summary + full notice
// link), then one unticked checkbox per purpose.

export type ConsentDraft = {
  consenter: 'self' | 'guardian';
  guardianName: string;
  guardianRelationship: string;
  core: boolean;       // required: store on phone + tag for emergency use
  smsAlerts: boolean;  // optional
};

export function emptyConsentDraft(): ConsentDraft {
  return { consenter: 'self', guardianName: '', guardianRelationship: '', core: false, smsAlerts: false };
}

// Pre-fill from an existing record. `core` is only pre-ticked if that record
// was for the current notice version — a new version needs a fresh action.
export function draftFromRecord(record: ConsentRecord | undefined): ConsentDraft {
  if (!record) return emptyConsentDraft();
  return {
    consenter: record.guardian ? 'guardian' : 'self',
    guardianName: record.guardian?.name ?? '',
    guardianRelationship: record.guardian?.relationship ?? '',
    core: record.version === PRIVACY_NOTICE_VERSION,
    smsAlerts: record.smsAlerts,
  };
}

export function validateConsentDraft(d: ConsentDraft): string | null {
  if (d.consenter === 'guardian' && (!d.guardianName.trim() || !d.guardianRelationship.trim())) {
    return 'Enter the parent or guardian’s name and relationship';
  }
  if (!d.core) {
    return 'LifeTap needs your consent to store your profile on this phone and your tag';
  }
  return null;
}

// Builds the record to save. Keeps choices the form doesn't cover (cloud
// backup, contacts confirmation) from the previous record.
export function recordFromDraft(
  d: ConsentDraft,
  previous: ConsentRecord | undefined,
  contactsConfirmed: boolean
): ConsentRecord {
  const now = Date.now();
  const sameVersion = previous?.version === PRIVACY_NOTICE_VERSION;
  return {
    version: PRIVACY_NOTICE_VERSION,
    acceptedAt: sameVersion && previous ? previous.acceptedAt : now,
    updatedAt: now,
    smsAlerts: d.smsAlerts,
    cloudBackup: previous?.cloudBackup ?? false,
    cloudBackupAt: previous?.cloudBackupAt ?? null,
    contactsConfirmed,
    guardian:
      d.consenter === 'guardian'
        ? { name: d.guardianName.trim(), relationship: d.guardianRelationship.trim() }
        : null,
  };
}

function Choice({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center py-2"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View
        className="w-5 h-5 rounded-full items-center justify-center mr-3"
        style={{ borderWidth: 2, borderColor: selected ? '#0f766e' : '#cbd5e1' }}
      >
        {selected && <View className="w-2.5 h-2.5 rounded-full bg-teal-700" />}
      </View>
      <Text className="text-slate-700 text-sm flex-1">{label}</Text>
    </TouchableOpacity>
  );
}

export default function ConsentForm({
  draft,
  onChange,
}: {
  draft: ConsentDraft;
  onChange: (d: ConsentDraft) => void;
}) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  const set = (patch: Partial<ConsentDraft>) => onChange({ ...draft, ...patch });

  return (
    <View>
      <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
        {NOTICE_SUMMARY.map(item => (
          <View key={item.title} className="mb-3">
            <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
              {item.title}
            </Text>
            <Text className="text-slate-600 text-sm leading-5">{item.body}</Text>
          </View>
        ))}
        <TouchableOpacity
          onPress={() => setNoticeOpen(true)}
          accessibilityRole="link"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-teal-700 text-sm font-semibold">Read the full privacy notice ›</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-4">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
          Who is giving consent?
        </Text>
        <Choice
          selected={draft.consenter === 'self'}
          label="Me — I’m 18 or older and this is my own profile"
          onPress={() => set({ consenter: 'self' })}
        />
        <Choice
          selected={draft.consenter === 'guardian'}
          label="A parent or guardian, for a minor or someone who can’t consent"
          onPress={() => set({ consenter: 'guardian' })}
        />
        {draft.consenter === 'guardian' && (
          <View className="mt-1">
            <TextInput
              value={draft.guardianName}
              onChangeText={v => set({ guardianName: v })}
              placeholder="Parent / guardian full name"
              placeholderTextColor="#cbd5e1"
              className="text-slate-800 text-sm py-2 border-b border-slate-100"
            />
            <TextInput
              value={draft.guardianRelationship}
              onChangeText={v => set({ guardianRelationship: v })}
              placeholder="Relationship (e.g. Mother, Legal guardian)"
              placeholderTextColor="#cbd5e1"
              className="text-slate-800 text-sm py-2"
            />
          </View>
        )}
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <ConsentCheckbox
          checked={draft.core}
          onChange={v => set({ core: v })}
          required
          label="I agree to LifeTap storing this profile, including medical information, on this phone and on the LifeTap tag, so emergency responders can read it."
        />
        <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
        <ConsentCheckbox
          checked={draft.smsAlerts}
          onChange={v => set({ smsAlerts: v })}
          label="Responders may text my emergency contacts my name and where and when I was found."
        />
      </View>

      <PrivacyNoticeModal visible={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </View>
  );
}
