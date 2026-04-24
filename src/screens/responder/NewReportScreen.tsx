import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View className="mb-4">
      <Text className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoCapitalize={autoCapitalize}
        className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-700 text-base"
      />
    </View>
  );
}

export default function NewReportScreen() {
  const navigation = useNavigation<any>();
  const {
    createReport,
    activeReport,
    responderProfile,
  } = useApp();

  const [name, setName] = useState('');
  const [location, setLocation] = useState(responderProfile?.city ?? '');
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!name.trim() || !location.trim() || !date.trim()) {
      Alert.alert('Missing fields', 'Report name, location, and date are required.');
      return;
    }

    const proceed = async () => {
      setSubmitting(true);
      try {
        await createReport(name.trim(), location.trim(), date.trim());
        navigation.navigate('Main', { screen: 'Scan' });
      } catch (e: any) {
        Alert.alert('Error', String(e?.message ?? e));
      } finally {
        setSubmitting(false);
      }
    };

    if (activeReport) {
      Alert.alert(
        'Replace active report?',
        `"${activeReport.name}" is currently active. Starting a new report will deactivate it (it will remain saved).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center mt-6 mb-6">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 mr-3"
            >
              <Text className="text-slate-600 text-sm font-semibold">← Back</Text>
            </TouchableOpacity>
            <Text className="text-slate-800 text-xl font-bold">New Report</Text>
          </View>

          {activeReport && (
            <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
              <Text className="text-amber-700 text-base mr-2">⚠</Text>
              <Text className="text-amber-800 text-xs flex-1">
                "{activeReport.name}" is currently active. Starting a new report will deactivate it.
              </Text>
            </View>
          )}

          <Field
            label="Report Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Taal Volcano Evacuation"
            autoCapitalize="words"
          />
          <Field
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Batangas City"
            autoCapitalize="words"
          />
          <Field
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />

          {responderProfile && (
            <View className="bg-white border border-slate-100 rounded-2xl px-4 py-3 mb-4">
              <Text className="text-slate-400 text-xs uppercase tracking-widest mb-1">
                Responder
              </Text>
              <Text className="text-slate-700 text-sm font-semibold">
                {responderProfile.full_name}
              </Text>
              {responderProfile.organization && (
                <Text className="text-slate-400 text-xs mt-0.5">
                  {responderProfile.organization}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={onSubmit}
            disabled={submitting}
            className="bg-teal-600 rounded-2xl py-4 items-center justify-center mt-2"
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-bold">START REPORT</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
