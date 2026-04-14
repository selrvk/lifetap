import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';

type Kin = { n: string; p: string; r: string };

// ─────────────────────────────────────────────
// SHARED COMPONENTS — matches ProfileScreen style
// ─────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl mb-3 overflow-hidden border border-slate-100">
      <View className="px-4 pt-3 pb-1">
        <View className="self-start bg-teal-50 border border-teal-100 rounded-full px-3 py-1">
          <Text className="text-teal-600 text-xs font-semibold uppercase tracking-wider">
            {title}
          </Text>
        </View>
      </View>
      <View className="px-4 py-2">{children}</View>
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

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────

export default function NFCResultScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { data } = route.params;

  // TODO: wire to real auth context later
  const isAuthorized = false;

  function getInitials(name: string): string {
    return name?.split(' ').slice(0, 2).map((w: string) => w[0]).join('') ?? '?';
  }

  function getAge(dob: string): number {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
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
            style={{ backgroundColor: isAuthorized ? '#0f766e' : '#f59e0b' }}
          >
            <Text className="text-white text-xs font-bold">
              {isAuthorized ? '🔓 Authorized Access' : '👁 Civilian Access'}
            </Text>
          </View>
        </View>

        {/* Identity header card — matches ProfileScreen header */}
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
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{data.bt}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Blood Type</Text>
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

        {/* Personal info — always visible */}
        <SectionCard title="Personal Information">
          <SectionItem label={`📅  ${new Date(data.dob).toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric' })}`} />
          <SectionItem label={`📍  ${data.brg}, ${data.cty}`} />
          <SectionItem label={`📞  ${data.phn}`} last />
        </SectionCard>

        {/* Emergency contacts — always visible */}
        <SectionCard title="Emergency Contacts">
          {data.kin?.length === 0
            ? <SectionItem label="No emergency contacts" last />
            : data.kin?.map((k: Kin, i: number) => (
                <View
                  key={i}
                  className="py-3"
                  style={i < data.kin.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }
                    : undefined}
                >
                  <Text className="text-slate-700 text-sm font-semibold">{k.n}</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{k.r} · {k.p}</Text>
                </View>
              ))
          }
        </SectionCard>

        {/* AUTHORIZED — full medical info */}
        {isAuthorized ? (
          <>
            <SectionCard title="Allergies">
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

            <SectionCard title="Medical Conditions">
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
          /* CIVILIAN — locked banner */
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 flex-row items-center">
            <Text className="text-2xl mr-3">🔒</Text>
            <View className="flex-1">
              <Text className="text-amber-800 text-sm font-semibold">
                Medical Info Restricted
              </Text>
              <Text className="text-amber-600 text-xs mt-0.5 leading-4">
                Sign in as an authorized medical responder to view allergies, conditions, and medications.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}