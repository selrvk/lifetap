module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
  // Transform RN-ecosystem packages and the ESM-only crypto libraries.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@noble|fflate|nativewind|react-native-css-interop|react-native-.*)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
