import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

// Unticked by default wherever it's used — the Data Privacy Act (and NPC
// Circular 2023-04) require an express, affirmative action for consent.
export default function ConsentCheckbox({
  checked,
  onChange,
  label,
  required = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!checked)}
      activeOpacity={0.8}
      className="flex-row items-start py-3"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View
        className="w-6 h-6 rounded-md items-center justify-center mr-3 mt-0.5"
        style={{
          borderWidth: 2,
          borderColor: checked ? '#0f766e' : '#cbd5e1',
          backgroundColor: checked ? '#0f766e' : '#ffffff',
        }}
      >
        {checked && <Text className="text-white text-xs font-bold">✓</Text>}
      </View>
      <View className="flex-1">
        <Text className="text-slate-700 text-sm leading-5">{label}</Text>
        <Text
          className="text-[11px] font-semibold mt-1"
          style={{ color: required ? '#b45309' : '#94a3b8' }}
        >
          {required ? 'Required' : 'Optional'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
