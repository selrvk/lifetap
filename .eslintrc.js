module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node scripts (key management, tag tests) are ES modules.
      files: ['scripts/**/*.mjs'],
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      env: { node: true },
    },
  ],
};
