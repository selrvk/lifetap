import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { saveLocalUser, getLocalUser, LocalUser, Kin } from '../storage/asyncStorage';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

function generateId(): string {
  return 'lt-' + Date.now().toString(36);
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

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

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  last = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  last?: boolean;
}) {
  return (
    <View
      className="py-3"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
    >
      <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor="#cbd5e1"
        keyboardType={keyboardType}
        className="text-slate-800 text-sm py-1"
      />
    </View>
  );
}

function ChipInput({
  label,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInput('');
  }

  return (
    <View className="mb-4">
      <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onRemove(i)}
            className="bg-teal-50 border border-teal-200 rounded-full px-3 py-1 flex-row items-center"
            style={{ gap: 4 }}
          >
            <Text className="text-teal-700 text-xs">{item}</Text>
            <Text className="text-teal-400 text-xs">✕</Text>
          </TouchableOpacity>
        ))}
        {items.length === 0 && (
          <Text className="text-slate-300 text-xs italic">None added yet</Text>
        )}
      </View>
      <View className="flex-row bg-white border border-slate-200 rounded-xl overflow-hidden">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={placeholder ?? `Add ${label.toLowerCase()}...`}
          placeholderTextColor="#cbd5e1"
          className="flex-1 text-sm px-3 py-2 text-slate-800"
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={handleAdd}
          className="bg-teal-600 px-4 items-center justify-center"
        >
          <Text className="text-white text-lg font-light">+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// STEP SCREENS
// ─────────────────────────────────────────────

function StepPersonal({
  data, onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Personal Info</Text>
      <Text className="text-slate-400 text-sm mb-6">Tell us about yourself</Text>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Field label="Full Name" value={data.n} onChange={v => onChange('n', v)}
          placeholder="e.g. Juan Dela Cruz" />
        <Field label="Date of Birth" value={data.dob} onChange={v => onChange('dob', v)}
          placeholder="YYYY-MM-DD" last />
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider pt-3 mb-2">
          Blood Type
        </Text>
        <View className="flex-row flex-wrap pb-3" style={{ gap: 8 }}>
          {BLOOD_TYPES.map(bt => (
            <TouchableOpacity
              key={bt}
              onPress={() => onChange('bt', bt)}
              className="rounded-xl px-4 py-2 border"
              style={{
                backgroundColor: data.bt === bt ? '#0f766e' : '#f0fdfa',
                borderColor: data.bt === bt ? '#0f766e' : '#ccfbf1',
              }}
            >
              <Text style={{ color: data.bt === bt ? 'white' : '#0f766e', fontSize: 13, fontWeight: '500' }}>
                {bt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Field label="Religion" value={data.rel} onChange={v => onChange('rel', v)}
          placeholder="e.g. Catholic" last />
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-slate-700 text-sm font-semibold">Organ Donor</Text>
            <Text className="text-slate-400 text-xs mt-0.5">
              Allow organs to be donated in an emergency
            </Text>
          </View>
          <Switch
            value={data.od}
            onValueChange={v => onChange('od', v)}
            trackColor={{ false: '#e2e8f0', true: '#0f766e' }}
            thumbColor="#ffffff"
          />
        </View>
      </View>
    </View>
  );
}

function StepAddress({
  data, onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Address</Text>
      <Text className="text-slate-400 text-sm mb-6">Where are you located?</Text>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Field label="Barangay" value={data.brg} onChange={v => onChange('brg', v)}
          placeholder="e.g. Barangay Poblacion" />
        <Field label="City" value={data.cty} onChange={v => onChange('cty', v)}
          placeholder="e.g. Batangas City, Batangas" />
        <Field label="Phone Number" value={data.phn} onChange={v => onChange('phn', v)}
          placeholder="e.g. 09171234567" keyboardType="phone-pad" last />
      </View>
    </View>
  );
}

function StepMedical({
  data, onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Medical Info</Text>
      <Text className="text-slate-400 text-sm mb-6">
        Tap a chip to remove it. Press + to add.
      </Text>

      <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
        <ChipInput
          label="Allergies"
          items={data.a}
          onAdd={v => onChange('a', [...data.a, v])}
          onRemove={i => onChange('a', data.a.filter((_: any, idx: number) => idx !== i))}
          placeholder="e.g. penicillin"
        />
        <ChipInput
          label="Conditions"
          items={data.c}
          onAdd={v => onChange('c', [...data.c, v])}
          onRemove={i => onChange('c', data.c.filter((_: any, idx: number) => idx !== i))}
          placeholder="e.g. Type 2 Diabetes"
        />
        <ChipInput
          label="Medications"
          items={data.meds}
          onAdd={v => onChange('meds', [...data.meds, v])}
          onRemove={i => onChange('meds', data.meds.filter((_: any, idx: number) => idx !== i))}
          placeholder="e.g. metformin 500mg"
        />
      </View>
    </View>
  );
}

function StepKin({
  data, onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  const [n, setN] = useState('');
  const [p, setP] = useState('');
  const [r, setR] = useState('');

  function handleAdd() {
    if (!n.trim() || !p.trim() || !r.trim()) return;
    onChange('kin', [...data.kin, { n: n.trim(), p: p.trim(), r: r.trim() }]);
    setN(''); setP(''); setR('');
  }

  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Next of Kin</Text>
      <Text className="text-slate-400 text-sm mb-6">
        Emergency contacts who can be reached on your behalf
      </Text>

      {/* Existing kin */}
      {data.kin.length > 0 && (
        <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
          {data.kin.map((k: Kin, i: number) => (
            <View
              key={i}
              className="flex-row items-center py-3"
              style={i < data.kin.length - 1
                ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' }
                : undefined}
            >
              <View className="flex-1">
                <Text className="text-slate-700 text-sm font-semibold">{k.n}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">{k.r} · {k.p}</Text>
              </View>
              <TouchableOpacity
                onPress={() => onChange('kin', data.kin.filter((_: any, idx: number) => idx !== i))}
              >
                <Text className="text-red-300 text-sm px-2">Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add kin form */}
      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider pt-3 mb-3">
          Add Contact
        </Text>
        <Field label="Name" value={n} onChange={setN} placeholder="e.g. Maria Dela Cruz" />
        <Field label="Relationship" value={r} onChange={setR} placeholder="e.g. Mother" />
        <Field label="Phone" value={p} onChange={setP}
          placeholder="e.g. 09171234567" keyboardType="phone-pad" last />
        <TouchableOpacity
          onPress={handleAdd}
          className="bg-teal-50 border border-teal-200 rounded-xl py-3 items-center my-3"
        >
          <Text className="text-teal-700 text-sm font-semibold">+ Add Contact</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StepPrivacy({
  data, onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Privacy</Text>
      <Text className="text-slate-400 text-sm mb-6">
        Control what others can see when they scan your LifeTap
      </Text>

      <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-slate-700 text-sm font-semibold">
              Public Profile
            </Text>
            <Text className="text-slate-400 text-xs mt-1">
              {data.is_public
                ? 'Anyone who scans your tag sees your full medical info'
                : 'Civilians only see your name and blood type. Authorized personnel see everything.'}
            </Text>
          </View>
          <Switch
            value={data.is_public}
            onValueChange={v => onChange('is_public', v)}
            trackColor={{ false: '#e2e8f0', true: '#0f766e' }}
            thumbColor="#ffffff"
          />
        </View>
      </View>

      <View
        className="rounded-2xl p-4 mb-4"
        style={{ backgroundColor: data.is_public ? '#f0fdfa' : '#fefce8',
          borderWidth: 1, borderColor: data.is_public ? '#99f6e4' : '#fde68a' }}
      >
        <Text style={{ color: data.is_public ? '#0f766e' : '#92400e',
          fontSize: 12, lineHeight: 18 }}>
          {data.is_public
            ? '✅  Your full profile — including allergies, conditions, medications and emergency contacts — will be visible to anyone who scans your tag.'
            : '🔒  Only your name and blood type will be shown to civilians. Medical responders with authorized access can see your full profile.'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// GATE SCREEN (no user exists)
// ─────────────────────────────────────────────

function GateScreen({ onNewUser, onExistingUser }: {
  onNewUser: () => void;
  onExistingUser: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <View className="flex-1 px-6 justify-center">
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-teal-100 items-center justify-center mb-4">
            <Text className="text-3xl">👤</Text>
          </View>
          <Text className="text-teal-900 text-2xl font-bold text-center">
            Welcome to LifeTap
          </Text>
          <Text className="text-slate-400 text-sm text-center mt-2 leading-5">
            Do you already have a LifeTap cloud account?
          </Text>
        </View>

        <TouchableOpacity
          onPress={onExistingUser}
          className="bg-teal-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white text-base font-semibold">
            Yes, I have an account
          </Text>
          <Text className="text-teal-200 text-xs mt-0.5">
            Sign in with your phone number
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNewUser}
          className="bg-white border border-teal-100 rounded-2xl py-4 items-center"
          activeOpacity={0.85}
        >
          <Text className="text-teal-700 text-base font-semibold">
            No, I'm new here
          </Text>
          <Text className="text-slate-400 text-xs mt-0.5">
            Set up my LifeTap profile
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// ONBOARDING FLOW
// ─────────────────────────────────────────────

const STEPS = ['Personal', 'Address', 'Medical', 'Next of Kin', 'Privacy'];

function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    n: '', dob: '', bt: '', rel: '', od: false,
    brg: '', cty: '', phn: '',
    a: [] as string[], c: [] as string[], meds: [] as string[],
    kin: [] as Kin[],
    is_public: false,
  });

  function handleChange(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const user: LocalUser = {
      id: generateId(),
      ...form,
      lastModified: Date.now(),
      syncedToTag: false,
      syncedToCloud: false,
    };
    await saveLocalUser(user);
    setSaving(false);
    onComplete();
  }

  const stepComponents = [
    <StepPersonal data={form} onChange={handleChange} />,
    <StepAddress data={form} onChange={handleChange} />,
    <StepMedical data={form} onChange={handleChange} />,
    <StepKin data={form} onChange={handleChange} />,
    <StepPrivacy data={form} onChange={handleChange} />,
  ];

  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress bar */}
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs text-slate-400">
              Step {step + 1} of {STEPS.length}
            </Text>
            <Text className="text-xs text-teal-700 font-semibold">
              {STEPS[step]}
            </Text>
          </View>
          <View className="h-1.5 bg-teal-100 rounded-full overflow-hidden">
            <View
              className="h-full bg-teal-600 rounded-full"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mt-6">
            {stepComponents[step]}
          </View>
        </ScrollView>

        {/* Bottom nav */}
        <View
          className="flex-row px-5 py-4 bg-white border-t border-slate-100"
          style={{ gap: 12 }}
        >
          {step > 0 && (
            <TouchableOpacity
              onPress={() => setStep(s => s - 1)}
              className="flex-1 border border-teal-200 rounded-2xl py-4 items-center"
              activeOpacity={0.85}
            >
              <Text className="text-teal-700 font-semibold">Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={isLast ? handleSave : () => setStep(s => s + 1)}
            className="flex-1 bg-teal-600 rounded-2xl py-4 items-center"
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text className="text-white font-semibold">
                  {isLast ? 'Save Profile' : 'Next'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// PROFILE VIEW (existing user)
// ─────────────────────────────────────────────

function ProfileView({ user }: { user: LocalUser }) {
  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 mt-6 mb-4">
          <View className="flex-row items-center" style={{ gap: 12 }}>
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
          <View className="flex-row mt-4" style={{ gap: 8 }}>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{user.bt}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Blood Type</Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold">{getAge(user.dob)}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Age</Text>
            </View>
            <View className="flex-1 bg-teal-50 rounded-xl py-2 items-center">
              <Text className="text-teal-700 text-sm font-semibold" numberOfLines={1}>
                {user.rel}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Religion</Text>
            </View>
          </View>
        </View>

        <SectionCard title="Personal Information">
          <SectionItem label={`📅  ${new Date(user.dob).toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric' })}`} />
          <SectionItem label={`📍  ${user.brg}, ${user.cty}`} />
          <SectionItem label={`📞  ${user.phn}`} last />
        </SectionCard>

        <SectionCard title="Allergies">
          {user.a.length === 0
            ? <SectionItem label="No known allergies" last />
            : user.a.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.a.length - 1} />
              ))}
        </SectionCard>

        <SectionCard title="Medical Conditions">
          {user.c.length === 0
            ? <SectionItem label="No known conditions" last />
            : user.c.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.c.length - 1} />
              ))}
        </SectionCard>

        <SectionCard title="Medications">
          {user.meds.length === 0
            ? <SectionItem label="No medications" last />
            : user.meds.map((item, i) => (
                <SectionItem key={i} label={item} last={i === user.meds.length - 1} />
              ))}
        </SectionCard>

        <SectionCard title="Emergency Contacts">
          {user.kin.length === 0
            ? <SectionItem label="No emergency contacts" last />
            : user.kin.map((k, i) => (
                <View key={i} className="py-2"
                  style={i < user.kin.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}>
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

        <SectionCard title="Privacy">
          <SectionItem
            label={user.is_public
              ? '🌐  Full profile visible to anyone'
              : '🔒  Limited info shown to civilians'}
            last
          />
        </SectionCard>

        <SectionCard title="Sync Status">
          <SectionItem label={`Tag  —  ${user.syncedToTag ? '✅ Synced' : '⚠️ Out of date'}`} />
          <SectionItem label={`Cloud  —  ${user.syncedToCloud ? '✅ Synced' : '⚠️ Out of date'}`} />
          <SectionItem
            label={`Last modified  —  ${new Date(user.lastModified).toLocaleString('en-PH')}`}
            last
          />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// MAIN EXPORT — orchestrates all states
// ─────────────────────────────────────────────

type ScreenState = 'loading' | 'gate' | 'onboarding' | 'existing_account' | 'profile';

export default function ProfileScreen() {
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [user, setUser] = useState<LocalUser | null>(null);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setScreen('loading');
        const data = await getLocalUser();
        if (data) {
          setUser(data);
          setScreen('profile');
        } else {
          setScreen('gate');
        }
      }
      load();
    }, [])
  );

  async function handleOnboardingComplete() {
    const data = await getLocalUser();
    setUser(data);
    setScreen('profile');
  }

  if (screen === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  if (screen === 'gate') {
    return (
      <GateScreen
        onNewUser={() => setScreen('onboarding')}
        onExistingUser={() => setScreen('existing_account')}
      />
    );
  }

  if (screen === 'existing_account') {
    // Placeholder — phone OTP login wired here later
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center px-6">
        <Text className="text-teal-900 text-lg font-semibold text-center mb-2">
          Cloud Sign In
        </Text>
        <Text className="text-slate-400 text-sm text-center mb-8">
          Phone OTP login coming soon
        </Text>
        <TouchableOpacity
          onPress={() => setScreen('gate')}
          className="border border-teal-200 rounded-2xl px-6 py-3"
        >
          <Text className="text-teal-700 font-semibold">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (screen === 'onboarding') {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return <ProfileView user={user!} />;
}