import React, { useState } from 'react';
import { Text, View } from 'react-native';
import PrivacyNoticeModal from './PrivacyNoticeModal';

// Just-in-time notice before a phone-OTP sign-in, which creates an account
// automatically. Used on both sign-in screens.
export default function SignInNotice() {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-4">
      <Text className="text-slate-400 text-xs leading-4">
        Sending a code creates a LifeTap account for this number if you don’t
        have one. Your profile is only uploaded to LifeTap Cloud if you choose
        to back it up.{' '}
        <Text
          className="text-teal-700 font-semibold"
          onPress={() => setOpen(true)}
          accessibilityRole="link"
        >
          Privacy notice
        </Text>
      </Text>
      <PrivacyNoticeModal visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}
