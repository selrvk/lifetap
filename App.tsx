import './global.css'
import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import Navigation from './src/navigation';
import { initNfc } from './src/services/nfc';

export default function App() {

  useEffect(() => {
    initNfc();
  }, []);
  
  return <Navigation />;
}