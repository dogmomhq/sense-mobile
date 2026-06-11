// Standalone preview of the reskinned screens (no game logic).
// Web/CI: pick a screen via URL —
//   ?reskin=home | ?reskin=question&t=6 | ?reskin=countdown[&beat=3|2|1|go]
//   ?reskin=shell  (AppShell: logged-out header, pendingCount=2, nav states)
// Native (Expo Go): edit DEFAULT_SCREEN below, or wire into App.js later.
import React from 'react';
import { View, Text, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import CountdownScreen from './CountdownScreen';
import AppShell from './AppShell';
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

function ShellPlaceholder() {
  const s = useScale();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: COLORS.creamDim, fontFamily: FONTS.interBold, fontSize: 34 * s,
        letterSpacing: 0.1 * 34 * s }}>CONTENT SLOT</Text>
    </View>
  );
}

// countdown loops in preview: remount on each onDone
function CountdownLoop({ freezeBeat }) {
  const [k, setK] = React.useState(0);
  if (freezeBeat) return <CountdownScreen freezeBeat={freezeBeat} />;
  return <CountdownScreen key={k} onDone={() => setK((x) => x + 1)} />;
}

const DEFAULT_SCREEN = 'home';

export default function PreviewApp() {
  const ready = useSenseFonts();
  let which = DEFAULT_SCREEN, t = NaN, beat = null;  // no ?t= -> NaN -> live ring
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    which = q.get('reskin') || DEFAULT_SCREEN;
    if (q.get('t') != null) t = parseFloat(q.get('t'));
    beat = q.get('beat');
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (which === 'question') return (
    <View style={{ flex: 1 }}>
      <QuestionScreen showClock secondsLeft={isNaN(t) ? null : t} />
      <DemoLabel />
    </View>
  );
  if (which === 'question-live') return <QuestionScreen showClock />;
  if (which === 'countdown') return <CountdownLoop freezeBeat={beat} />;
  if (which === 'shell') return (
    <AppShell signedIn={false} pendingCount={2} activeTab="home" showClock>
      <ShellPlaceholder />
    </AppShell>
  );
  return <HomeScreen showClock />;
}
