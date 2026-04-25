import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { sendVictimAlert } from '../services/sms';
import {
  getReportById,
  saveReport as storageSaveReport,
} from '../storage/asyncStorage';
import type { ReportEntry } from '../types/responder';

type Kin = { n: string; p: string; r: string };

type Tone = 'default' | 'critical' | 'warning';

const TONE_STYLES: Record<Tone, {
  border: string; stripe: string; badgeBg: string; badgeBorder: string; badgeText: string;
}> = {
  default:  { border: '#f1f5f9', stripe: 'transparent', badgeBg: '#f0fdfa', badgeBorder: '#ccfbf1', badgeText: '#0f766e' },
  critical: { border: '#fecaca', stripe: '#dc2626',     badgeBg: '#fef2f2', badgeBorder: '#fecaca', badgeText: '#b91c1c' },
  warning:  { border: '#fde68a', stripe: '#d97706',     badgeBg: '#fffbeb', badgeBorder: '#fde68a', badgeText: '#b45309' },
};

function SectionCard({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: React.ReactNode;
  tone?: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <View
      className="bg-white rounded-2xl mb-3 overflow-hidden border flex-row"
      style={{ borderColor: t.border }}
    >
      <View style={{ width: 4, backgroundColor: t.stripe }} />
      <View className="flex-1">
        <View className="px-4 pt-3 pb-1">
          <View
            className="self-start rounded-full px-3 py-1 border"
            style={{ backgroundColor: t.badgeBg, borderColor: t.badgeBorder }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: t.badgeText }}
            >
              {title}
            </Text>
          </View>
        </View>
        <View className="px-4 py-2">{children}</View>
      </View>
    </View>
  );
}

function SectionItem({ label, last = false }: { label: string; last?: boolean }) {
  return (
    <View
      className="py-3"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' } : undefined}
    >
      <Text className="text-slate-600 text-sm leading-5">{label}</Text>
    </View>
  );
}

function CallableItem({ name, sub, phone, last = false }: {
  name: string; sub: string; phone: string; last?: boolean;
}) {
  function dial() {
    const digits = phone.replace(/\D/g, '');
    if (digits) Linking.openURL(`tel:${digits}`).catch(() => {});
  }
  return (
    <View
      className="py-3 flex-row items-center"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' } : undefined}
    >
      <View className="flex-1">
        <Text className="text-slate-700 text-sm font-semibold">{name}</Text>
        <Text className="text-slate-400 text-xs mt-0.5">{sub}</Text>
      </View>
      <TouchableOpacity
        onPress={dial}
        className="rounded-xl px-4 py-2"
        style={{ backgroundColor: '#16a34a' }}
        accessibilityRole="button"
        accessibilityLabel={`Call ${name}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>Call</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NFCResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    data,
    fromReport: fromReportParam,
    viewOnly = false,
  } = route.params ?? {};
  const { role, activeReport, responderProfile, addVictimToReport } = useApp();

  const isResponder =
    role === 'medic' || role === 'responder' || role === 'admin';
  const isAuthorized = isResponder || data?.is_public === true;

  // Freeze the active report we add to, so later context updates don't
  // cause us to re-add to a different report. viewOnly skips the auto-add.
  const targetReportIdRef = useRef<string | null>(
    !viewOnly && isResponder && activeReport ? activeReport.id : null
  );
  const targetReportNameRef = useRef<string | null>(
    viewOnly
      ? (fromReportParam ?? null)
      : (fromReportParam ?? activeReport?.name ?? null)
  );

  const [entryId, setEntryId] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const addedRef = useRef(false);

  // On mount, if responder + active report → add victim to the report.
  useEffect(() => {
    if (!isResponder || !targetReportIdRef.current || addedRef.current) return;
    if (!data) return;
    addedRef.current = true;

    const newEntry: ReportEntry = {
      id: `${data.id}-${Date.now()}`,
      n: data.n,
      bt: data.bt,
      dob: data.dob,
      a: data.a ?? [],
      c: data.c ?? [],
      meds: data.meds ?? [],
      kin: data.kin ?? [],
      scannedAt: Date.now(),
      smsSent: false,
    };
    setEntryId(newEntry.id);
    addVictimToReport(targetReportIdRef.current, newEntry).catch(() => {
      addedRef.current = false;
    });
  }, [isResponder, data, addVictimToReport]);

  async function markEntrySmsSent() {
    const rid = targetReportIdRef.current;
    if (!rid || !entryId) return;
    const report = await getReportById(rid);
    if (!report) return;
    const updated = {
      ...report,
      entries: report.entries.map((e) =>
        e.id === entryId ? { ...e, smsSent: true } : e
      ),
      syncedToCloud: false,
    };
    await storageSaveReport(updated);
  }

  async function onSendAlert() {
    if (!data?.kin || data.kin.length === 0) return;
    if (!responderProfile) {
      Alert.alert('Not signed in', 'Sign in as personnel to send alerts.');
      return;
    }
    setSendingSms(true);
    const entry: ReportEntry = {
      id: entryId ?? `${data.id}-${Date.now()}`,
      n: data.n,
      bt: data.bt,
      dob: data.dob,
      a: data.a ?? [],
      c: data.c ?? [],
      meds: data.meds ?? [],
      kin: data.kin,
      scannedAt: Date.now(),
      smsSent: false,
    };
    const location = activeReport?.location ?? data.cty ?? 'Unknown location';
    const res = await sendVictimAlert(
      entry,
      location,
      responderProfile.full_name
    );
    setSendingSms(false);
    if (res.ok) {
      setSmsSent(true);
      await markEntrySmsSent();
      Alert.alert('Alert sent', `SMS sent to ${res.sentTo?.length ?? 0} contact(s).`);
    } else {
      Alert.alert(
        'SMS failed',
        res.error === 'no_kin_numbers'
          ? 'No valid phone numbers for this victim.'
          : `Could not send SMS: ${res.error ?? 'unknown error'}`
      );
    }
  }

  function getInitials(name: string): string {
    return name?.split(' ').slice(0, 2).map((w: string) => w[0]).join('') ?? '?';
  }

  function getAge(dob: string): number {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  const hasKin = Array.isArray(data?.kin) && data.kin.length > 0;
  const showSmsSheet = !viewOnly && isResponder && hasKin;

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: showSmsSheet ? 180 : 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View className="flex-row items-center justify-between mt-6 mb-4">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2"
          >
            <Text className="text-slate-600 text-sm font-semibold">← Back</Text>
          </TouchableOpacity>
          <View
            className="rounded-xl px-3 py-1.5"
            style={{
              backgroundColor: isResponder
                ? '#0f766e'
                : isAuthorized
                ? '#0f766e'
                : '#f59e0b',
            }}
          >
            <Text className="text-white text-xs font-bold">
              {isResponder
                ? `🚑 ${role?.toUpperCase()} ACCESS`
                : isAuthorized
                ? '🔓 Public Record'
                : '👁 Civilian Access'}
            </Text>
          </View>
        </View>

        {/* Added-to-report banner */}
        {targetReportNameRef.current && (
          <View className="bg-teal-600 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
            <Text className="text-white text-base mr-2">✓</Text>
            <Text className="text-white text-sm font-semibold flex-1">
              Added to {targetReportNameRef.current}
            </Text>
          </View>
        )}

        {/* Identity header */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="w-12 h-12 rounded-xl bg-teal-700 items-center justify-center">
              <Text className="text-white text-base font-semibold">
                {getInitials(data.n)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-teal-900 text-base font-semibold">{data.n}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">ID: {data.id}</Text>
            </View>
            {data.od && (
              <View className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                <Text className="text-teal-700 text-xs font-semibold">Organ Donor</Text>
              </View>
            )}
          </View>

          <View className="flex-row mt-4" style={{ gap: 8 }}>
            {/* Blood type gets red — only stat a civilian can act on */}
            <View
              className="flex-1 rounded-xl py-2 items-center"
              style={{ backgroundColor: '#dc2626' }}
            >
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>
                {data.bt || '—'}
              </Text>
              <Text style={{ color: '#fecaca', fontSize: 11, marginTop: 2 }}>
                Blood Type
              </Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">
                {getAge(data.dob)}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Age</Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold" numberOfLines={1}>
                {data.rel}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Religion</Text>
            </View>
          </View>
        </View>

        <SectionCard title="Personal Information">
          <SectionItem label={`📅  ${new Date(data.dob + 'T00:00:00').toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric' })}`} />
          <SectionItem label={`📍  ${data.brg}, ${data.cty}`} />
          <CallableItem
            name={`📞  ${data.phn}`}
            sub="Personal phone"
            phone={data.phn}
            last
          />
        </SectionCard>

        <SectionCard title="Emergency Contacts">
          {data.kin?.length === 0
            ? <SectionItem label="No emergency contacts" last />
            : data.kin?.map((k: Kin, i: number) => (
                <CallableItem
                  key={i}
                  name={k.n}
                  sub={`${k.r}  ·  ${k.p}`}
                  phone={k.p}
                  last={i === data.kin.length - 1}
                />
              ))
          }
        </SectionCard>

        {isAuthorized ? (
          <>
            <SectionCard
              title={data.a?.length > 0 ? '⚠ Allergies' : 'Allergies'}
              tone={data.a?.length > 0 ? 'critical' : 'default'}
            >
              {data.a?.length === 0
                ? <SectionItem label="No known allergies" last />
                : data.a?.map((item: string, i: number) => (
                    <SectionItem
                      key={i}
                      label={item}
                      last={i === data.a.length - 1}
                    />
                  ))
              }
            </SectionCard>

            <SectionCard
              title="Medical Conditions"
              tone={data.c?.length > 0 ? 'warning' : 'default'}
            >
              {data.c?.length === 0
                ? <SectionItem label="No known conditions" last />
                : data.c?.map((item: string, i: number) => (
                    <SectionItem
                      key={i}
                      label={item}
                      last={i === data.c.length - 1}
                    />
                  ))
              }
            </SectionCard>

            <SectionCard title="Medications">
              {data.meds?.length === 0
                ? <SectionItem label="No medications" last />
                : data.meds?.map((item: string, i: number) => (
                    <SectionItem
                      key={i}
                      label={item}
                      last={i === data.meds.length - 1}
                    />
                  ))
              }
            </SectionCard>
          </>
        ) : (
          <>
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 flex-row items-center">
              <Text className="text-2xl mr-3">🔒</Text>
              <View className="flex-1">
                <Text className="text-amber-800 text-sm font-semibold">
                  Medical Info Restricted
                </Text>
                <Text className="text-amber-600 text-xs mt-0.5 leading-4">
                  Allergies, conditions, and medications are only visible to authorized responders.
                </Text>
              </View>
            </View>

            {/* Civilian first aid guidance */}
            <View className="bg-white border border-slate-100 rounded-2xl p-4 mb-3">
              <Text className="text-slate-700 text-sm font-bold mb-3">
                If this person needs help:
              </Text>
              {[
                { icon: '🚨', text: 'Call emergency services (911) immediately' },
                { icon: '🩹', text: 'Keep the person still and comfortable' },
                { icon: '📡', text: 'Stay on the line with the dispatcher' },
                { icon: '🏷️', text: 'Tell responders a LifeTap tag was scanned' },
              ].map(({ icon, text }, i) => (
                <View key={i} className="flex-row items-start mb-2" style={{ gap: 10 }}>
                  <Text style={{ fontSize: 16 }}>{icon}</Text>
                  <Text className="text-slate-500 text-sm flex-1 leading-5">{text}</Text>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => Linking.openURL('tel:911').catch(() => {})}
                className="rounded-xl py-3 items-center mt-2"
                style={{ backgroundColor: '#dc2626' }}
                accessibilityRole="button"
                accessibilityLabel="Call 911"
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>
                  Call 911
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>

      {/* SMS action sheet — responders only, when kin exists */}
      {showSmsSheet && (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: 'white',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <View className="flex-row items-center mb-2">
            <Text className="text-base mr-2">📱</Text>
            <Text className="text-slate-700 text-sm font-semibold flex-1">
              {smsSent
                ? 'Alert sent to emergency contacts'
                : 'Send SMS to emergency contacts'}
            </Text>
          </View>
          <Text className="text-slate-400 text-xs mb-3" numberOfLines={2}>
            {data.kin
              .map((k: Kin) => `${k.n} (${k.r}) · ${k.p}`)
              .join('  •  ')}
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={onSendAlert}
              disabled={sendingSms || smsSent}
              className="flex-1 rounded-xl items-center justify-center py-3"
              style={{
                backgroundColor: smsSent ? '#0f766e' : '#dc2626',
                opacity: sendingSms ? 0.6 : 1,
              }}
            >
              {sendingSms ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-sm font-bold">
                  {smsSent ? '✓ SENT' : 'SEND ALERT'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="rounded-xl items-center justify-center py-3 px-5 bg-slate-100"
            >
              <Text className="text-slate-600 text-sm font-semibold">Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
