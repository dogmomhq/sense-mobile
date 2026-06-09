// Standalone preview of the reskinned screens (no game logic).
// Web/CI: pick a screen via URL — ?reskin=home or ?reskin=question&t=6
// Native (Expo Go): edit DEFAULT_SCREEN below, or wire into App.js later.
import React from 'react';
import { View, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import { useSenseFonts } from './theme';

const DEFAULT_SCREEN = 'home';

export default function PreviewApp() {
  const ready = useSenseFonts();
  let which = DEFAULT_SCREEN, t = 6;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    which = q.get('reskin') || DEFAULT_SCREEN;
    if (q.get('t') != null) t = parseFloat(q.get('t'));
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (which === 'question') return <QuestionScreen showClock secondsLeft={isNaN(t) ? null : t} />;
  if (which === 'question-live') return <QuestionScreen showClock />;
  return <HomeScreen showClock />;
}
