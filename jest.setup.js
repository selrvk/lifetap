/* eslint-env jest */
// Mocks for native modules so screens and storage can run under Jest.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

// Native-driver animations can't attach to the test renderer; with this mock
// Animated falls back to the JS driver.
jest.mock('react-native/src/private/animated/NativeAnimatedHelper');

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// In-memory stand-in for the Keychain / EncryptedSharedPreferences. Like iOS,
// removing a key that doesn't exist rejects. Tests reach the store via
// require('react-native-encrypted-storage').default.__store.
jest.mock('react-native-encrypted-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key) => {
        if (!store.delete(key)) {
          throw new Error('RNEncryptedStorageError: An error occured while removing value');
        }
      }),
      clear: jest.fn(async () => store.clear()),
    },
  };
});

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

// The NFC library ships a mock for its native module next to the real one.
jest.mock('react-native-nfc-manager/src/NativeNfcManager');

jest.mock('react-native-linear-gradient', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});

jest.mock('@react-native-community/datetimepicker', () =>
  require('@react-native-community/datetimepicker/jest')
);
