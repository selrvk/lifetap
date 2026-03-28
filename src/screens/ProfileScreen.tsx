import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './../lib/supabase'; 

type Kin = { n: string; p: string; r: string };

type User = {
  id: string;
  n: string;
  dob: string;
  bt: string;
  brg: string;
  cty: string;
  phn: string;
  rel: string;
  od: boolean;
  a: string[];
  c: string[];
  meds: string[];
  kin: Kin[];
};

function getAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl mb-3 overflow-hidden border border-slate-100">
      <View className="bg-teal-700 px-4 py-2">
        <Text className="text-white text-xs font-semibold uppercase tracking-widest">
          {title}
        </Text>
      </View>
      <View className="px-4 py-2">{children}</View>
    </View>
  );
}

function SectionItem({ label, last = false }: { label: string; last?: boolean }) {
  return (
    <View
      className="flex-row items-center py-2"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
    >
      <View className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-3" />
      <Text className="text-slate-700 text-sm">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', 'lt-2')
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching user:', error.message);
      } else {
        setUser(data);
      }
      setLoading(false);
    }
    fetchUser();
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <Text className="text-gray-400">No profile found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 mt-6 mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-xl bg-teal-700 items-center justify-center">
              <Text className="text-white text-base font-semibold">
                {getInitials(user.n)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-teal-900 text-base font-semibold">{user.n}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">ID: {user.id}</Text>
            </View>
            {user.od && (
              <View className="bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                <Text className="text-teal-700 text-xs font-semibold">Organ Donor</Text>
              </View>
            )}
          </View>

          {/* Quick stats */}
          <View className="flex-row gap-3 mt-4">
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{user.bt}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Blood Type</Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{getAge(user.dob)}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Age</Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{user.rel}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Religion</Text>
            </View>
          </View>
        </View>

        {/* Personal Info */}
        <SectionCard title="Personal Information">
          <SectionItem label={`📅  ${new Date(user.dob).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`} />
          <SectionItem label={`📍  ${user.brg}, ${user.cty}`} />
          <SectionItem label={`📞  ${user.phn}`} last />
        </SectionCard>

        {/* Allergies */}
        <SectionCard title="Allergies">
          {user.a.length === 0
            ? <SectionItem label="No known allergies" last />
            : user.a.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.a.length - 1} />
              ))
          }
        </SectionCard>

        {/* Conditions */}
        <SectionCard title="Medical Conditions">
          {user.c.length === 0
            ? <SectionItem label="No known conditions" last />
            : user.c.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.c.length - 1} />
              ))
          }
        </SectionCard>

        {/* Medications */}
        <SectionCard title="Medications">
          {user.meds.length === 0
            ? <SectionItem label="No medications" last />
            : user.meds.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.meds.length - 1} />
              ))
          }
        </SectionCard>

        {/* Emergency Contacts */}
        <SectionCard title="Emergency Contacts">
          {user.kin.map((k, i) => (
            <View
              key={i}
              className="py-2"
              style={i < user.kin.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
            >
              <View className="flex-row items-center">
                <View className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-3" />
                <View className="flex-1">
                  <Text className="text-slate-700 text-sm font-semibold">{k.n}</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{k.r} · {k.p}</Text>
                </View>
              </View>
            </View>
          ))}
        </SectionCard>

      </ScrollView>
    </SafeAreaView>
  );
}