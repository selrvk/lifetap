import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConsentHistory, ConsentHistory } from '../services/consentLog';
import type { ConsentEvent, ConsentEventKind } from '../storage/asyncStorage';

const LABELS: Record<ConsentEventKind, string> = {
  given: 'Consent given',
  renewed: 'Accepted an updated privacy notice',
  changed: 'Consent choices changed',
  cloud_backup_given: 'Cloud backup turned on',
  withdrawn: 'Consent withdrawn',
  account_deleted: 'Account deleted',
};

function describeChoices(e: ConsentEvent): string | null {
  if (!e.choices) return null;
  const c = e.choices;
  const parts = [
    `SMS alerts ${c.smsAlerts ? 'on' : 'off'}`,
    `Cloud backup ${c.cloudBackup ? 'on' : 'off'}`,
  ];
  if (c.guardian) parts.push(`given by ${c.guardian.name} (${c.guardian.relationship})`);
  return parts.join(' · ');
}

export default function ConsentHistoryModal({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<ConsentHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    getConsentHistory()
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch(() => { if (!cancelled) setHistory({ events: [], cloudLoaded: false }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-teal-50" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="text-teal-900 text-lg font-bold">Consent history</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text className="text-slate-500 text-sm font-semibold">Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
          <Text className="text-slate-400 text-xs leading-4 mb-4">
            A record of each time you gave, renewed or changed your consent. It’s kept on
            this phone, and in LifeTap Cloud too if cloud backup is on.
          </Text>

          {history === null ? (
            <ActivityIndicator color="#0f766e" style={{ marginTop: 24 }} />
          ) : (
            <>
              {history.cloudLoaded === false && (
                <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-3">
                  <Text className="text-amber-700 text-xs">
                    Couldn’t load the cloud copy — showing what’s on this phone.
                  </Text>
                </View>
              )}

              {history.events.length === 0 ? (
                <View className="bg-white border border-slate-100 rounded-2xl px-5 py-8 items-center">
                  <Text className="text-slate-400 text-sm text-center">
                    No consent history recorded yet.
                  </Text>
                </View>
              ) : (
                <View className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  {history.events.map((e, i) => {
                    const choices = describeChoices(e);
                    return (
                      <View
                        key={e.id}
                        className="px-4 py-3"
                        style={i < history.events.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' } : undefined}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-slate-700 text-sm font-semibold flex-1 mr-2">
                            {LABELS[e.kind] ?? e.kind}
                          </Text>
                          <Text className="text-slate-400 text-xs">
                            {new Date(e.at).toLocaleString('en-PH', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </Text>
                        </View>
                        {choices && <Text className="text-slate-500 text-xs mt-1">{choices}</Text>}
                        <Text className="text-slate-400 text-[11px] mt-1">
                          Notice {e.noticeVersion} · {e.uploaded ? 'Saved in LifeTap Cloud' : 'On this phone only'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
