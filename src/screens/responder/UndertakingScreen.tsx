import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signOutSupabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { clearCloudSession, saveResponderUndertaking } from '../../storage/asyncStorage';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import {
  RESPONDER_UNDERTAKING,
  RESPONDER_UNDERTAKING_VERSION,
} from '../../legal/privacyNotice';

// Shown once per personnel account (and again if the undertaking version
// changes) before responder mode unlocks. Rendered by Navigation in place of
// the responder tabs.
export default function UndertakingScreen({ onAccepted }: { onAccepted: () => void }) {
  const { accountId, responderProfile, refreshSession } = useApp();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    if (!agreed || !accountId) return;
    setBusy(true);
    await saveResponderUndertaking(accountId, RESPONDER_UNDERTAKING_VERSION);

    // Best effort: record it on the personnel row so the LGU can see who has
    // accepted. Allowed by the self-update guard (only these columns).
    if (responderProfile?.phone) {
      const { error } = await supabase
        .from('personnel')
        .update({
          undertaking_accepted_at: new Date().toISOString(),
          undertaking_version: RESPONDER_UNDERTAKING_VERSION,
        })
        .eq('phone', responderProfile.phone);
      if (error) console.warn('[undertaking] cloud record failed:', error.message);
    }

    setBusy(false);
    onAccepted();
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutSupabase();
      await clearCloudSession();
      await refreshSession();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-red-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-red-700 text-xs font-semibold uppercase tracking-widest mt-4">
          Responder mode
        </Text>
        <Text className="text-slate-800 text-2xl font-bold mt-1 mb-4">
          Confidentiality undertaking
        </Text>

        <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
          <Text className="text-slate-600 text-sm leading-5 mb-3">
            {RESPONDER_UNDERTAKING.intro}
          </Text>
          {RESPONDER_UNDERTAKING.points.map((point, i) => (
            <View key={i} className="flex-row mb-2" style={{ gap: 8 }}>
              <Text className="text-red-600 text-sm">•</Text>
              <Text className="text-slate-700 text-sm leading-5 flex-1">{point}</Text>
            </View>
          ))}
          <Text className="text-slate-500 text-xs leading-4 mt-2">
            {RESPONDER_UNDERTAKING.closing}
          </Text>
        </View>

        <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
          <ConsentCheckbox
            checked={agreed}
            onChange={setAgreed}
            required
            label={`I, ${responderProfile?.full_name ?? 'the undersigned'}, have read and agree to this undertaking.`}
          />
        </View>

        <TouchableOpacity
          onPress={handleAccept}
          disabled={!agreed || busy}
          className="bg-red-600 rounded-2xl py-4 items-center"
          style={{ opacity: !agreed || busy ? 0.5 : 1 }}
          activeOpacity={0.85}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text className="text-white text-base font-bold">Agree and continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignOut} disabled={busy} className="items-center mt-4">
          <Text className="text-slate-500 text-sm">Not now — sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
