module.exports = {
  presets: [
    'module:@react-native/babel-preset',
    'nativewind/babel',
  ],
  env: {
    // Release bundles: drop console.log/info/debug so debugging output can
    // never leak profile data to device logs. Errors and warnings stay.
    production: {
      plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
    },
  },
};
