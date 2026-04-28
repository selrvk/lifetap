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
  Modal,
  Alert,
  Linking,
  Image,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_WIDTH = SCREEN_WIDTH - 40; // 20px padding each side
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import {
  saveLocalUser,
  getLocalUser,
  updateLocalUser,
  overwriteLocalUserFromCloud,
  LocalUser,
  Kin,
  CloudSession,
  saveCloudSession,
} from '../storage/asyncStorage';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Fix 1: guard against invalid/empty dob
function getAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

// Fix 2: collision-resistant ID
function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `lt-${ts}-${rand}`;
}

// Fix 4: PH phone validation + normalisation
function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('63')) return '0' + digits.slice(2);
  return digits.startsWith('0') ? digits : '0' + digits;
}

function isValidPHPhone(p: string): boolean {
  return /^09\d{9}$/.test(normalizePhone(p));
}

// ─────────────────────────────────────────────
// VALIDATION (Fix 3 + Fix 6)
// ─────────────────────────────────────────────

function validateStep(step: number, form: any): string | null {
  switch (step) {
    case 0:
      if (!form.n.trim()) return 'Full name is required';
      return null;
    case 1:
      if (!form.phn.trim()) return 'Phone number is required';
      if (!isValidPHPhone(form.phn))
        return 'Enter a valid PH phone number (e.g. 09171234567)';
      return null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

type Tone = 'default' | 'critical' | 'warning';

const TONE_STYLES: Record<Tone, {
  border: string; stripe: string; badgeBg: string; badgeBorder: string; badgeText: string;
}> = {
  default: {
    border: '#f1f5f9', stripe: 'transparent',
    badgeBg: '#f0fdfa', badgeBorder: '#ccfbf1', badgeText: '#0f766e',
  },
  critical: {
    border: '#fecaca', stripe: '#dc2626',
    badgeBg: '#fef2f2', badgeBorder: '#fecaca', badgeText: '#b91c1c',
  },
  warning: {
    border: '#fde68a', stripe: '#d97706',
    badgeBg: '#fffbeb', badgeBorder: '#fde68a', badgeText: '#b45309',
  },
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
      className="bg-white rounded-2xl mb-3 overflow-hidden border"
      style={{ borderColor: t.border }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: t.stripe }} />
      <View style={{ marginLeft: 4 }}>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  last = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  last?: boolean;
  optional?: boolean;
}) {
  return (
    <View
      className="py-3"
      style={!last ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' } : undefined}
    >
      <View className="flex-row items-center mb-1">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider">
          {label}
        </Text>
        {optional && (
          <Text className="text-xs text-slate-400 ml-1.5">· optional</Text>
        )}
      </View>
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

// DOB date picker — platform-correct: iOS shows a spinner inside a bottom sheet,
// Android uses the native dialog (must NOT be wrapped in Modal).
function toIso(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const initial = value ? new Date(value + 'T00:00:00') : new Date(2000, 0, 1);
  const [tempDate, setTempDate] = useState<Date>(initial);

  const displayDate = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  function openPicker() {
    setTempDate(value ? new Date(value + 'T00:00:00') : new Date(2000, 0, 1));
    setShow(true);
  }

  return (
    <>
      <View
        className="py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: '#f8fafc' }}
      >
        <View className="flex-row items-center mb-1">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider">
            Date of Birth
          </Text>
          <Text className="text-xs text-slate-400 ml-1.5">· optional</Text>
        </View>
        <TouchableOpacity
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Select date of birth"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            className="text-sm py-1"
            style={{ color: displayDate ? '#1e293b' : '#cbd5e1' }}
          >
            {displayDate ?? 'Select date of birth'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Android: native dialog. Render only while shown; never wrap in Modal. */}
      {Platform.OS === 'android' && show && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1900, 0, 1)}
          onValueChange={(event, date) => {
            setShow(false);
            if (event.type === 'set' && date) onChange(toIso(date));
          }}
          onDismiss={() => setShow(false)}
        />
      )}

      {/* iOS: custom bottom sheet with spinner and explicit Confirm/Cancel. */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={show}
          transparent
          animationType="fade"
          onRequestClose={() => setShow(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShow(false)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'flex-end',
            }}
          >
            <View
              style={{
                backgroundColor: 'white',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                paddingBottom: 36,
              }}
            >
                <Text className="text-teal-900 text-base font-bold mb-2 text-center">
                  Select Date of Birth
                </Text>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  minimumDate={new Date(1900, 0, 1)}
                  style={{ height: 216, width: '100%' }}
                  textColor="#1e293b"
                  onValueChange={(_, date) => {
                    if (date) setTempDate(date);
                  }}
                />
                <TouchableOpacity
                  onPress={() => {
                    onChange(toIso(tempDate));
                    setShow(false);
                  }}
                  className="bg-teal-600 rounded-2xl py-4 items-center mt-2"
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold">Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShow(false)}
                  className="items-center py-3"
                >
                  <Text className="text-slate-400 text-sm">Cancel</Text>
                </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

// Common medical entries to nudge users away from free-text typos like "Bunny"
const COMMON_ALLERGIES = [
  'Penicillin', 'Aspirin', 'Ibuprofen', 'Sulfa drugs', 'Peanuts',
  'Tree nuts', 'Shellfish', 'Eggs', 'Dairy', 'Soy', 'Latex', 'Bee stings',
];
const COMMON_CONDITIONS = [
  'Hypertension', 'Type 1 Diabetes', 'Type 2 Diabetes', 'Asthma', 'Epilepsy',
  'Heart Disease', 'Stroke history', 'Kidney Disease', 'Pregnancy',
  'Hemophilia', 'Anemia', 'Thyroid disorder',
];

function ChipInput({
  label,
  items,
  onAdd,
  onRemove,
  placeholder,
  suggestions,
}: {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState('');

  function handleAdd(value?: string) {
    const trimmed = (value ?? input).trim();
    if (!trimmed) return;
    if (items.some(i => i.toLowerCase() === trimmed.toLowerCase())) {
      setInput('');
      return;
    }
    onAdd(trimmed);
    setInput('');
  }

  const remainingSuggestions = (suggestions ?? []).filter(
    s => !items.some(i => i.toLowerCase() === s.toLowerCase())
  );

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
          onSubmitEditing={() => handleAdd()}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={() => handleAdd()}
          className="bg-teal-600 px-4 items-center justify-center"
          accessibilityLabel={`Add ${label.toLowerCase()}`}
        >
          <Text className="text-white text-lg font-light">+</Text>
        </TouchableOpacity>
      </View>
      {remainingSuggestions.length > 0 && (
        <View className="mt-2">
          <Text className="text-slate-400 text-[11px] mb-1">Suggestions</Text>
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {remainingSuggestions.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => handleAdd(s)}
                className="bg-slate-50 border border-slate-200 rounded-full px-3 py-1"
                accessibilityLabel={`Add ${s}`}
              >
                <Text className="text-slate-600 text-xs">+ {s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// STEP SCREENS
// ─────────────────────────────────────────────

function StepPersonal({
  data,
  onChange,
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
        <Field
          label="Full Name"
          value={data.n}
          onChange={v => onChange('n', v)}
          placeholder="e.g. Juan Dela Cruz"
        />
        {/* Fix: replaced TextInput with date picker */}
        <DateField value={data.dob} onChange={v => onChange('dob', v)} />
        <View className="py-3">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
            Age
          </Text>
          <Text className="text-slate-400 text-sm py-1">
            {data.dob ? `${getAge(data.dob) ?? '—'} years old` : '—'}
          </Text>
        </View>
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <View className="flex-row items-center pt-3 mb-2">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider">
            Blood Type
          </Text>
          <Text className="text-xs text-slate-400 ml-1.5">· optional</Text>
        </View>
        <View className="flex-row flex-wrap pb-3" style={{ gap: 8 }}>
          {BLOOD_TYPES.map(bt => (
            <TouchableOpacity
              key={bt}
              onPress={() => onChange('bt', data.bt === bt ? '' : bt)}
              className="rounded-xl px-4 py-2 border"
              style={{
                backgroundColor: data.bt === bt ? '#0f766e' : '#f0fdfa',
                borderColor: data.bt === bt ? '#0f766e' : '#ccfbf1',
              }}
            >
              <Text
                style={{
                  color: data.bt === bt ? 'white' : '#0f766e',
                  fontSize: 13,
                  fontWeight: '500',
                }}
              >
                {bt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Field
          label="Religion"
          value={data.rel}
          onChange={v => onChange('rel', v)}
          placeholder="e.g. Catholic"
          optional
          last
        />
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
  data,
  onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Address</Text>
      <Text className="text-slate-400 text-sm mb-6">Where are you located? (optional)</Text>

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Field
          label="Barangay"
          value={data.brg}
          onChange={v => onChange('brg', v)}
          placeholder="e.g. Barangay Poblacion"
          optional
        />
        <Field
          label="City"
          value={data.cty}
          onChange={v => onChange('cty', v)}
          placeholder="e.g. Batangas City, Batangas"
          optional
        />
        {/* Fix 4: phone-pad + validation hint */}
        <Field
          label="Phone Number"
          value={data.phn}
          onChange={v => onChange('phn', v)}
          placeholder="e.g. 09171234567"
          keyboardType="phone-pad"
          last
        />
        {data.phn.trim() !== '' && !isValidPHPhone(data.phn) && (
          <Text className="text-amber-500 text-xs pb-3 -mt-1">
            Enter a valid PH number (e.g. 09171234567)
          </Text>
        )}
      </View>
    </View>
  );
}

function StepMedical({
  data,
  onChange,
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
          suggestions={COMMON_ALLERGIES}
        />
        <ChipInput
          label="Conditions"
          items={data.c}
          onAdd={v => onChange('c', [...data.c, v])}
          onRemove={i => onChange('c', data.c.filter((_: any, idx: number) => idx !== i))}
          placeholder="e.g. Type 2 Diabetes"
          suggestions={COMMON_CONDITIONS}
        />
        <ChipInput
          label="Medications"
          items={data.meds}
          onAdd={v => onChange('meds', [...data.meds, v])}
          onRemove={i =>
            onChange('meds', data.meds.filter((_: any, idx: number) => idx !== i))
          }
          placeholder="e.g. metformin 500mg"
        />
      </View>
    </View>
  );
}

function StepKin({
  data,
  onChange,
}: {
  data: any;
  onChange: (k: string, v: any) => void;
}) {
  const [n, setN] = useState('');
  const [p, setP] = useState('');
  const [r, setR] = useState('');
  // Fix 7: feedback when partial fields on Add
  const [kinError, setKinError] = useState<string | null>(null);

  function handleAdd() {
    if (!n.trim() || !p.trim() || !r.trim()) {
      setKinError('Please fill in name, relationship, and phone before adding');
      return;
    }
    setKinError(null);
    onChange('kin', [...data.kin, { n: n.trim(), p: p.trim(), r: r.trim() }]);
    setN('');
    setP('');
    setR('');
  }

  return (
    <View>
      <Text className="text-teal-900 text-xl font-bold mb-1">Next of Kin</Text>
      <Text className="text-slate-400 text-sm mb-6">
        Emergency contacts who can be reached on your behalf
      </Text>

      {data.kin.length > 0 && (
        <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
          {data.kin.map((k: Kin, i: number) => (
            <View
              key={i}
              className="flex-row items-center py-3"
              style={
                i < data.kin.length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' }
                  : undefined
              }
            >
              <View className="flex-1">
                <Text className="text-slate-700 text-sm font-semibold">{k.n}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  {k.r} · {k.p}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  onChange(
                    'kin',
                    data.kin.filter((_: any, idx: number) => idx !== i)
                  )
                }
              >
                <Text className="text-red-300 text-sm px-2">Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View className="bg-white rounded-2xl border border-slate-100 px-4 mb-4">
        <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider pt-3 mb-3">
          Add Contact
        </Text>
        <Field label="Name" value={n} onChange={setN} placeholder="e.g. Maria Dela Cruz" />
        <Field label="Relationship" value={r} onChange={setR} placeholder="e.g. Mother" />
        <Field
          label="Phone"
          value={p}
          onChange={setP}
          placeholder="e.g. 09171234567"
          keyboardType="phone-pad"
          last
        />
        {kinError && (
          <Text className="text-red-400 text-xs mt-1 mb-2">{kinError}</Text>
        )}
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
  data,
  onChange,
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
            <Text className="text-slate-700 text-sm font-semibold">Public Profile</Text>
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
        style={{
          backgroundColor: data.is_public ? '#f0fdfa' : '#fefce8',
          borderWidth: 1,
          borderColor: data.is_public ? '#99f6e4' : '#fde68a',
        }}
      >
        <Text
          style={{
            color: data.is_public ? '#0f766e' : '#92400e',
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {data.is_public
            ? '✅  Your full profile — including allergies, conditions, medications and emergency contacts — will be visible to anyone who scans your tag.'
            : '🔒  Only your name and blood type will be shown to civilians. Medical responders with authorized access can see your full profile.'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// GATE SCREEN
// ─────────────────────────────────────────────

function GateScreen({
  onNewUser,
  onExistingUser,
}: {
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
          <Text className="text-teal-700 text-base font-semibold">No, I'm new here</Text>
          <Text className="text-slate-400 text-xs mt-0.5">Set up my LifeTap profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// FIX 5: EXISTING ACCOUNT — phone OTP + cloud restore
// ─────────────────────────────────────────────

type LoginStep = 'phone' | 'otp' | 'loading' | 'restoring';

function ExistingAccountScreen({
  onRestored,
  onNotFound,
  onCancel,
}: {
  onRestored: (user: LocalUser) => void;
  onNotFound: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { refreshSession } = useApp();

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '+63' + digits.slice(1);
    if (digits.startsWith('63')) return '+' + digits;
    return '+63' + digits;
  }

  async function handleSendOTP() {
    setError(null);
    const formatted = formatPhone(phone);
    if (formatted.length < 12) {
      setError('Enter a valid phone number');
      return;
    }
    setStep('loading');
    const { error: e } = await supabase.auth.signInWithOtp({ phone: formatted });
    if (e) {
      setError(e.message);
      setStep('phone');
      return;
    }
    setStep('otp');
  }

  async function handleVerifyOTP() {
    setError(null);
    if (otp.length < 4) {
      setError('Enter the OTP code');
      return;
    }
    setStep('loading');
    const formatted = formatPhone(phone);
    const { data, error: e } = await supabase.auth.verifyOtp({
      phone: formatted,
      token: otp,
      type: 'sms',
    });
    if (e || !data.session) {
      setError(e?.message ?? 'Verification failed');
      setStep('otp');
      return;
    }

    const { data: personnelData } = await supabase
      .from('personnel')
      .select('full_name, role, city, badge_no, organization')
      .eq('phone', formatted)
      .eq('is_active', true)
      .single();

    const session: CloudSession = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      phone: formatted,
      user_id: data.session.user.id,
      expires_at: (data.session.expires_at ?? 0) * 1000,
      role: personnelData?.role ?? null,
      full_name: personnelData?.full_name ?? null,
      city: personnelData?.city ?? null,
      badge_no: personnelData?.badge_no ?? null,
      organization: personnelData?.organization ?? null,
    };
    await saveCloudSession(session);
    await refreshSession();

    // Restore by owner_id (Supabase user UUID) — guaranteed unique per account.
    // Searching by phn could return the wrong row if duplicates exist.
    setStep('restoring');
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('owner_id', data.session.user.id)
      .maybeSingle();

    if (userData) {
      const restored: LocalUser = {
        ...userData,
        lastModified: new Date(userData.updated_at).getTime(),
        syncedToTag: false,
        syncedToCloud: true,
      };
      await overwriteLocalUserFromCloud(restored);
      onRestored(restored);
    } else {
      // Signed in but no cloud profile found — proceed to onboarding
      onNotFound();
    }
  }

  if (step === 'loading' || step === 'restoring') {
    return (
      <SafeAreaView className="flex-1 bg-teal-50 items-center justify-center px-6">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="text-slate-400 text-sm mt-3">
          {step === 'restoring' ? 'Restoring your profile...' : 'Please wait...'}
        </Text>
      </SafeAreaView>
    );
  }

  if (step === 'otp') {
    return (
      <SafeAreaView className="flex-1 bg-teal-50">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-teal-900 text-lg font-bold mb-1">Enter OTP</Text>
          <Text className="text-slate-400 text-sm mb-6">
            We sent a 6-digit code to {formatPhone(phone)}
          </Text>
          <View className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
              OTP Code
            </Text>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="123456"
              placeholderTextColor="#cbd5e1"
              keyboardType="number-pad"
              maxLength={6}
              className="text-slate-800 text-2xl tracking-widest py-1"
              autoFocus
            />
          </View>
          {error && <Text className="text-red-400 text-xs mb-4">{error}</Text>}
          <TouchableOpacity
            onPress={handleVerifyOTP}
            className="bg-teal-600 rounded-2xl py-4 items-center mb-3"
            activeOpacity={0.85}
          >
            <Text className="text-white font-semibold">Restore Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setStep('phone');
              setOtp('');
              setError(null);
            }}
          >
            <Text className="text-slate-400 text-sm text-center">
              Wrong number? Go back
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-teal-900 text-lg font-bold mb-1">Restore from Cloud</Text>
        <Text className="text-slate-400 text-sm mb-6">
          Enter your phone number to find and restore your LifeTap profile
        </Text>
        <View className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs text-teal-700 font-semibold uppercase tracking-wider mb-1">
            Phone Number
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 09171234567"
            placeholderTextColor="#cbd5e1"
            keyboardType="phone-pad"
            className="text-slate-800 text-sm py-1"
            autoFocus
          />
        </View>
        {error && <Text className="text-red-400 text-xs mb-4">{error}</Text>}
        <TouchableOpacity
          onPress={handleSendOTP}
          className="bg-teal-600 rounded-2xl py-4 items-center mb-3"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold">Send Code</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-slate-400 text-sm text-center">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// ONBOARDING FLOW
// ─────────────────────────────────────────────

const STEP_LABELS = ['Personal', 'Address', 'Medical', 'Next of Kin', 'Privacy'];

function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [form, setForm] = useState({
    n: '',
    dob: '',
    bt: '',
    rel: '',
    od: false,
    brg: '',
    cty: '',
    phn: '',
    a: [] as string[],
    c: [] as string[],
    meds: [] as string[],
    kin: [] as Kin[],
    is_public: false,
  });

  function handleChange(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function handleNext() {
    const err = validateStep(step, form);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setStep(s => s + 1);
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

  const isLast = step === STEP_LABELS.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs text-slate-400">
              Step {step + 1} of {STEP_LABELS.length}
            </Text>
            <Text className="text-xs text-teal-700 font-semibold">
              {STEP_LABELS[step]}
            </Text>
          </View>
          <View className="h-1.5 bg-teal-100 rounded-full overflow-hidden">
            <View
              className="h-full bg-teal-600 rounded-full"
              style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
            />
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mt-6">{stepComponents[step]}</View>
        </ScrollView>

        {/* Fix 3: inline step error */}
        {stepError && (
          <View className="mx-5 mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            <Text className="text-red-500 text-xs">{stepError}</Text>
          </View>
        )}

        <View
          className="flex-row px-5 bg-white border-t border-slate-100"
          style={{
            gap: 12,
            paddingTop: 12,
            paddingBottom: insets.bottom + 54 + 4,
          }}
        >
          {step > 0 && (
            <TouchableOpacity
              onPress={() => { setStep(s => s - 1); setStepError(null); }}
              className="flex-1 border border-teal-200 rounded-2xl py-4 items-center"
              activeOpacity={0.85}
            >
              <Text className="text-teal-700 font-semibold">Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={isLast ? handleSave : handleNext}
            className="flex-1 bg-teal-600 rounded-2xl py-4 items-center"
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold">
                {isLast ? 'Save Profile' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// EMERGENCY VIEW — large-text, high-contrast, responder-readable
// ─────────────────────────────────────────────

function EmergencyView({ user, onClose }: { user: LocalUser; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const age = getAge(user.dob);

  function callNumber(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    Linking.openURL(`tel:${digits}`).catch(() => {});
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View
              className="rounded-lg px-3 py-1"
              style={{ backgroundColor: '#dc2626' }}
            >
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>
                EMERGENCY MEDICAL ID
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close emergency view"
            >
              <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: '600' }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {/* Identity */}
          <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', lineHeight: 38 }}>
            {user.n || 'Unknown'}
          </Text>
          <Text style={{ color: '#cbd5e1', fontSize: 18, marginTop: 4 }}>
            {age != null ? `${age} years old` : '—'}
            {user.rel ? `  ·  ${user.rel}` : ''}
          </Text>

          {/* Vital strip */}
          <View className="flex-row mt-5" style={{ gap: 10 }}>
            <View
              className="flex-1 rounded-2xl py-3 items-center"
              style={{ backgroundColor: '#dc2626' }}
            >
              <Text style={{ color: '#fecaca', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>
                BLOOD TYPE
              </Text>
              <Text style={{ color: 'white', fontSize: 36, fontWeight: '800', marginTop: 2 }}>
                {user.bt || '—'}
              </Text>
            </View>
            <View
              className="flex-1 rounded-2xl py-3 items-center"
              style={{
                backgroundColor: user.od ? '#0f766e' : '#1e293b',
                borderWidth: 1,
                borderColor: user.od ? '#0f766e' : '#334155',
              }}
            >
              <Text
                style={{
                  color: user.od ? '#a7f3d0' : '#94a3b8',
                  fontSize: 12, fontWeight: '600', letterSpacing: 1,
                }}
              >
                ORGAN DONOR
              </Text>
              <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginTop: 6 }}>
                {user.od ? 'YES' : 'NO'}
              </Text>
            </View>
          </View>

          {/* Allergies — critical */}
          <EmergencySection
            title="ALLERGIES"
            tone="critical"
            items={user.a}
            empty="No known allergies"
          />

          {/* Conditions — warning */}
          <EmergencySection
            title="MEDICAL CONDITIONS"
            tone="warning"
            items={user.c}
            empty="No known conditions"
          />

          {/* Medications */}
          <EmergencySection
            title="MEDICATIONS"
            tone="neutral"
            items={user.meds}
            empty="None"
          />

          {/* Emergency contacts — tap to call */}
          <Text
            style={{
              color: '#94a3b8', fontSize: 13, fontWeight: '700',
              letterSpacing: 1.5, marginTop: 24, marginBottom: 8,
            }}
          >
            EMERGENCY CONTACTS
          </Text>
          {user.kin.length === 0 ? (
            <View
              className="rounded-2xl px-4 py-4"
              style={{ backgroundColor: '#1e293b' }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 16 }}>None listed</Text>
            </View>
          ) : (
            user.kin.map((k, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => callNumber(k.p)}
                className="rounded-2xl px-4 py-4 mb-2 flex-row items-center"
                style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' }}
                accessibilityRole="button"
                accessibilityLabel={`Call ${k.n}, ${k.r}`}
              >
                <View className="flex-1">
                  <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
                    {k.n}
                  </Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 14, marginTop: 2 }}>
                    {k.r}  ·  {k.p}
                  </Text>
                </View>
                <View
                  className="rounded-full px-4 py-2"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                    Call
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Address */}
          {(user.brg || user.cty) && (
            <View
              className="rounded-2xl px-4 py-3 mt-4"
              style={{ backgroundColor: '#1e293b' }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 12, letterSpacing: 1, fontWeight: '700' }}>
                ADDRESS
              </Text>
              <Text style={{ color: 'white', fontSize: 16, marginTop: 4 }}>
                {[user.brg, user.cty].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function EmergencySection({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: 'critical' | 'warning' | 'neutral';
  items: string[];
  empty: string;
}) {
  const palette =
    tone === 'critical'
      ? { label: '#fca5a5', bg: '#7f1d1d', text: 'white', empty: '#fecaca' }
      : tone === 'warning'
      ? { label: '#fcd34d', bg: '#78350f', text: 'white', empty: '#fde68a' }
      : { label: '#94a3b8', bg: '#1e293b', text: 'white', empty: '#94a3b8' };

  return (
    <>
      <Text
        style={{
          color: palette.label, fontSize: 13, fontWeight: '700',
          letterSpacing: 1.5, marginTop: 24, marginBottom: 8,
        }}
      >
        {title}
      </Text>
      <View
        className="rounded-2xl px-4 py-3"
        style={{ backgroundColor: palette.bg }}
      >
        {items.length === 0 ? (
          <Text style={{ color: palette.empty, fontSize: 16 }}>{empty}</Text>
        ) : (
          items.map((item, i) => (
            <Text
              key={i}
              style={{
                color: palette.text, fontSize: 20, fontWeight: '700',
                paddingVertical: 6,
              }}
            >
              •  {item}
            </Text>
          ))
        )}
      </View>
    </>
  );
}

// ─────────────────────────────────────────────
// PROFILE VIEW
// ─────────────────────────────────────────────

function ProfileView({
  user,
  onUpdated,
}: {
  user: LocalUser;
  onUpdated: (u: LocalUser) => void;
}) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [form, setForm] = useState({
    n: user.n,
    dob: user.dob,
    bt: user.bt,
    rel: user.rel,
    od: user.od,
    brg: user.brg,
    cty: user.cty,
    phn: user.phn,
    a: [...user.a],
    c: [...user.c],
    meds: [...user.meds],
    kin: [...user.kin],
    is_public: user.is_public,
  });

  function handleChange(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function handleStartEdit() {
    setForm({
      n: user.n, dob: user.dob, bt: user.bt, rel: user.rel, od: user.od,
      brg: user.brg, cty: user.cty, phn: user.phn,
      a: [...user.a], c: [...user.c], meds: [...user.meds],
      kin: [...user.kin], is_public: user.is_public,
    });
    setEditStep(0);
    setStepError(null);
    setEditing(true);
  }

  // Fix 8: dirty check before cancel
  function handleCancelEdit() {
    const original = {
      n: user.n, dob: user.dob, bt: user.bt, rel: user.rel, od: user.od,
      brg: user.brg, cty: user.cty, phn: user.phn,
      a: [...user.a], c: [...user.c], meds: [...user.meds],
      kin: [...user.kin], is_public: user.is_public,
    };
    const isDirty = JSON.stringify(form) !== JSON.stringify(original);
    if (isDirty) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to cancel?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => setEditing(false) },
        ]
      );
    } else {
      setEditing(false);
    }
  }

  function handleNext() {
    const err = validateStep(editStep, form);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setEditStep(s => s + 1);
  }

  async function handleSave() {
    setSaving(true);
    const updated = await updateLocalUser(form);
    setSaving(false);
    if (updated) {
      onUpdated(updated);
      setEditing(false);
    }
  }

  const isLast = editStep === STEP_LABELS.length - 1;

  const stepComponents = [
    <StepPersonal data={form} onChange={handleChange} />,
    <StepAddress data={form} onChange={handleChange} />,
    <StepMedical data={form} onChange={handleChange} />,
    <StepKin data={form} onChange={handleChange} />,
    <StepPrivacy data={form} onChange={handleChange} />,
  ];

  // ── EDIT MODE ──
  if (editing) {
    return (
      <SafeAreaView className="flex-1 bg-teal-50">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="px-5 pt-4 pb-2">
            <View className="flex-row items-center justify-between mb-2">
              <TouchableOpacity onPress={handleCancelEdit}>
                <Text className="text-red-400 text-xs font-semibold">Cancel</Text>
              </TouchableOpacity>
              <Text className="text-xs text-teal-700 font-semibold">
                {STEP_LABELS[editStep]}
              </Text>
              <Text className="text-xs text-slate-400">
                {editStep + 1} / {STEP_LABELS.length}
              </Text>
            </View>
            <View className="h-1.5 bg-teal-100 rounded-full overflow-hidden">
              <View
                className="h-full bg-teal-600 rounded-full"
                style={{ width: `${((editStep + 1) / STEP_LABELS.length) * 100}%` }}
              />
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="mt-6">{stepComponents[editStep]}</View>
          </ScrollView>

          {stepError && (
            <View className="mx-5 mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              <Text className="text-red-500 text-xs">{stepError}</Text>
            </View>
          )}

          <View
            className="flex-row px-5 bg-white border-t border-slate-100"
            style={{
              gap: 12,
              paddingTop: 12,
              paddingBottom: insets.bottom + 54 + 4,
            }}
          >
            {editStep > 0 && (
              <TouchableOpacity
                onPress={() => { setEditStep(s => s - 1); setStepError(null); }}
                className="flex-1 border border-teal-200 rounded-2xl py-4 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-teal-700 font-semibold">Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={isLast ? handleSave : handleNext}
              className="flex-1 bg-teal-600 rounded-2xl py-4 items-center"
              activeOpacity={0.85}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">
                  {isLast ? 'Save Changes' : 'Next'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── VIEW MODE ──
  return (
    <SafeAreaView className="flex-1 bg-teal-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 54 + 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO CARD ── */}
        <LinearGradient
          colors={['#14857A', '#0A4A43']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: HERO_WIDTH,
            borderRadius: 28,
            marginTop: 16,
            marginBottom: 16,
            shadowColor: '#0A4A43',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 18,
            elevation: 8,
            overflow: 'hidden',
          }}
        >
          <View style={{ padding: 18 }}>
          {/* Top row: avatar + name + edit */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
                {getInitials(user.n)}
              </Text>
            </View>

            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Text
                style={{ color: 'white', fontSize: 18, fontWeight: '700' }}
                numberOfLines={1}
              >
                {user.n}
              </Text>
              <Text
                style={{ color: '#a7f3d0', fontSize: 11, marginTop: 2, letterSpacing: 0.5 }}
                numberOfLines={1}
              >
                ID · {user.id}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleStartEdit}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
                backgroundColor: 'rgba(255,255,255,0.1)',
                flexShrink: 0,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Organ donor pill */}
          {user.od && (
            <View
              style={{
                alignSelf: 'flex-start',
                marginTop: 12,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: 'rgba(167,243,208,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(167,243,208,0.4)',
              }}
            >
              <Text style={{ color: '#a7f3d0', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                ORGAN DONOR
              </Text>
            </View>
          )}

          {/* Emergency CTA */}
          <TouchableOpacity
            onPress={() => setEmergencyOpen(true)}
            style={{
              marginTop: 16,
              backgroundColor: '#dc2626',
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#7f1d1d',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 6,
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Show emergency medical ID"
          >
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 }}>
              🚑  Show Emergency ID
            </Text>
          </TouchableOpacity>

          {/* Glass vitals */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {[
              { label: 'BLOOD TYPE', value: user.bt || '—' },
              { label: 'AGE',        value: getAge(user.dob)?.toString() ?? '—' },
              { label: 'RELIGION',   value: user.rel || '—' },
            ].map((tile, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                }}
              >
                <Text
                  style={{ color: 'white', fontSize: 16, fontWeight: '700' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {tile.value}
                </Text>
                <Text
                  style={{ color: '#a7f3d0', fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginTop: 4 }}
                  numberOfLines={1}
                >
                  {tile.label}
                </Text>
              </View>
            ))}
          </View>
          </View>
        </LinearGradient>

        <SectionCard title="Personal Information">
          <SectionItem
            label={`📅  ${
              user.dob
                ? new Date(user.dob + 'T00:00:00').toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '—'
            }`}
          />
          <SectionItem label={`📍  ${[user.brg, user.cty].filter(Boolean).join(', ') || '—'}`} />
          <SectionItem label={`📞  ${user.phn}`} last />
        </SectionCard>

        <SectionCard
          title={user.a.length > 0 ? '⚠ Allergies' : 'Allergies'}
          tone={user.a.length > 0 ? 'critical' : 'default'}
        >
          {user.a.length === 0 ? (
            <SectionItem label="No known allergies" last />
          ) : (
            user.a.map((item, i) => (
              <SectionItem key={i} label={item} last={i === user.a.length - 1} />
            ))
          )}
        </SectionCard>

        <SectionCard
          title="Medical Conditions"
          tone={user.c.length > 0 ? 'warning' : 'default'}
        >
          {user.c.length === 0 ? (
            <SectionItem label="No known conditions" last />
          ) : (
            user.c.map((item, i) => (
              <SectionItem key={i} label={item} last={i === user.c.length - 1} />
            ))
          )}
        </SectionCard>

        <SectionCard title="Medications">
          {user.meds.length === 0 ? (
            <SectionItem label="No medications" last />
          ) : (
            user.meds.map((item, i) => (
              <SectionItem key={i} label={item} last={i === user.meds.length - 1} />
            ))
          )}
        </SectionCard>

        <SectionCard title="Emergency Contacts">
          {user.kin.length === 0 ? (
            <SectionItem label="No emergency contacts" last />
          ) : (
            user.kin.map((k, i) => (
              <View
                key={i}
                className="py-2"
                style={
                  i < user.kin.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: '#f8fafc' }
                    : undefined
                }
              >
                <View className="flex-row items-center">
                  <View className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-3" />
                  <View className="flex-1">
                    <Text className="text-slate-700 text-sm font-semibold">{k.n}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      {k.r} · {k.p}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Privacy">
          <SectionItem
            label={
              user.is_public
                ? '🌐  Full profile visible to anyone'
                : '🔒  Limited info shown to civilians'
            }
            last
          />
        </SectionCard>

        <SectionCard title="Sync Status">
          <SectionItem
            label={`Tag  —  ${user.syncedToTag ? '✅ Synced' : '⚠️ Out of date'}`}
          />
          <SectionItem
            label={`Cloud  —  ${user.syncedToCloud ? '✅ Synced' : '⚠️ Out of date'}`}
          />
          <SectionItem
            label={`Last modified  —  ${new Date(user.lastModified).toLocaleString('en-PH')}`}
            last
          />
        </SectionCard>
      </ScrollView>

      {emergencyOpen && (
        <EmergencyView user={user} onClose={() => setEmergencyOpen(false)} />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// MAIN EXPORT
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

  // Fix 5: fully wired existing account restore
  if (screen === 'existing_account') {
    return (
      <ExistingAccountScreen
        onRestored={restored => {
          setUser(restored);
          setScreen('profile');
        }}
        onNotFound={() => {
          // Signed in but no cloud profile — go to onboarding
          Alert.alert(
            'No Profile Found',
            "We couldn't find a profile linked to this number. You can create a new one.",
            [{ text: 'OK', onPress: () => setScreen('onboarding') }]
          );
        }}
        onCancel={() => setScreen('gate')}
      />
    );
  }

  if (screen === 'onboarding') {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <ProfileView
      user={user!}
      onUpdated={updated => setUser(updated)}
    />
  );
}