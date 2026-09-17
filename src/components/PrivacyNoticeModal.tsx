import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NOTICE_SECTIONS,
  NOTICE_IS_DRAFT,
  PRIVACY_NOTICE_VERSION,
} from '../legal/privacyNotice';

export default function PrivacyNoticeModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-slate-100">
          <View>
            <Text className="text-teal-900 text-lg font-bold">Privacy Notice</Text>
            <Text className="text-slate-400 text-xs">Version {PRIVACY_NOTICE_VERSION}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close privacy notice"
          >
            <Text className="text-teal-700 text-sm font-semibold">Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        >
          {NOTICE_IS_DRAFT && (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
              <Text className="text-amber-800 text-xs">
                Draft — pending review by the LGU’s Data Protection Officer.
              </Text>
            </View>
          )}
          {NOTICE_SECTIONS.map(section => (
            <View key={section.heading} className="mb-5">
              <Text className="text-slate-800 text-sm font-bold mb-2">{section.heading}</Text>
              {section.paragraphs.map((p, i) => (
                <Text key={i} className="text-slate-600 text-sm leading-5 mb-2">
                  {p}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
