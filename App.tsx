import './global.css'
import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import Navigation from './src/navigation';
import { initNfc } from './src/services/nfc';
import { AppProvider } from './src/context/AppContext';

export default function App() {

  useEffect(() => {
    initNfc();
  }, []);

  return (
    <AppProvider>
      <Navigation />
    </AppProvider>
  );
}