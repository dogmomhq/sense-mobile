// Standalone preview of the reskinned screens (no game logic).
// Web/CI: pick a screen via URL — ?reskin=home or ?reskin=question&t=6
// Native (Expo Go): edit DEFAULT_SCREEN below, or wire into App.js later.
import React from 'react';
import { View, Text, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import { COLORS, FONTS, useSenseFonts, useScale } from './theme';

// demo caption the locked reference render carries at the bottom of the
// question screen (kept out of the real QuestionScreen — preview parity only)
function DemoLabel() {
  const s = useScale();
  return (
    <Text style={{ position: 'absolute', bottom: 40 * s, left: 0, right: 0, textAlign: 'center',
      color: COLORS.creamDim, fontFamily: FONTS.interBold, fontSize: 30 * s,
      letterSpacing: 0.2 * 30 * s, zIndex: 15 }}>FUSE RING</Text>
  );
}

const DEFAULT_SCREEN = 'home';

export default function PreviewApp() {
  const ready = useSenseFonts();
  let which = DEFAULT_SCREEN, t = NaN;  // no ?t= -> NaN -> secondsLeft=null -> live ring
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    which = q.get('reskin') || DEFAULT_SCREEN;
    if (q.get('t') != null) t = parseFloat(q.get('t'));
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (which === 'question') return (
    <View style={{ flex: 1 }}>
      <QuestionScreen showClock secondsLeft={isNaN(t) ? null : t} />
      <DemoLabel />
    </View>
  );
  if (which === 'question-live') return <QuestionScreen showClock />;
  return <HomeScreen showClock />;
}
