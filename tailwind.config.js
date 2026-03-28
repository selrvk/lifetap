/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    "./screens/**/*.{js,jsx,ts,tsx}",
    './index.js',
  ],
  presets: [require('nativewind/preset')], // add this
  theme: {
    extend: {},
  },
  plugins: [],
};