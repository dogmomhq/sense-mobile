// Standalone preview of the reskinned screens (no game logic).
// Web/CI: pick a screen via URL —
//   ?reskin=home | ?reskin=question&t=6 | ?reskin=countdown[&beat=3|2|1|go]
//   ?reskin=results&outcome=win|loss|nearmiss|closewin|draw[&at=reveal|race|explode|burst|payout]
//   ?reskin=shell  (AppShell: logged-out header, pendingCount=2, nav states)
// Native (Expo Go): edit DEFAULT_SCREEN below, or wire into App.js later.
import React from 'react';
import { View, Text, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import CountdownScreen from './CountdownScreen';
import AppShell from './AppShell';
import ResultsScreen from './ResultsScreen';
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

// results demo data (matches the HTML spec's D table per outcome)
const RESULTS_DEMO = {
  win:      { you: { answer: 'CHEETAH', time: 1.42, correct: true }, opp: { answer: 'CHEETAH', time: 1.76, correct: true }, record: { w: 12, d: 1, l: 4 } },
  loss:     { you: { answer: 'CHEETAH', time: 2.31, correct: true }, opp: { answer: 'CHEETAH', time: 1.42, correct: true }, record: { w: 12, d: 1, l: 5 } },
  nearmiss: { you: { answer: 'CHEETAH', time: 1.50, correct: true }, opp: { answer: 'CHEETAH', time: 1.42, correct: true }, record: { w: 12, d: 1, l: 5 } },
  closewin: { you: { answer: 'CHEETAH', time: 1.42, correct: true }, opp: { answer: 'CHEETAH', time: 1.50, correct: true }, record: { w: 13, d: 1, l: 4 } },
  draw:     { you: { answer: 'CHEETAH', time: 1.42, correct: true }, opp: { answer: 'CHEETAH', time: 1.42, correct: true }, record: { w: 12, d: 2, l: 4 } },
};

// results loops in preview: remount on each cycle end
function ResultsLoop({ outcome, at }) {
  const [k, setK] = React.useState(0);
  const d = RESULTS_DEMO[outcome] || RESULTS_DEMO.win;
  return (
    <ResultsScreen key={k} outcome={outcome} you={d.you} opp={d.opp} record={d.record}
      correctAnswer="CHEETAH" stake={1.0} payout={1.9} balanceBefore={24.5} streak={8}
      freezeAt={at || null} showClock onCycleEnd={at ? undefined : () => setK((x) => x + 1)} />
  );
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
    var outcome = q.get('outcome') || 'win';
    var at = q.get('at');
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
  if (which === 'results') return <ResultsLoop outcome={typeof outcome !== 'undefined' ? outcome : 'win'} at={typeof at !== 'undefined' ? at : null} />;
  if (which === 'shell') return (
    <AppShell signedIn={false} pendingCount={2} activeTab="home" showClock>
      <ShellPlaceholder />
    </AppShell>
  );
  return <HomeScreen showClock />;
}
