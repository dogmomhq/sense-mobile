// Standalone preview of the reskinned screens (no game logic).
// Web/CI: pick a screen via URL —
//   ?reskin=home | ?reskin=question&ring=laser|fuse[&t=6] | ?reskin=countdown[&beat=3|2|1|go]
//   ?reskin=results&outcome=win|loss|nearmiss|closewin|draw[&at=reveal|race|explode|burst|payout]
//   ?reskin=shell  (AppShell: logged-out header, pendingCount=2, nav states)
//   ?reskin=waiting | ?reskin=history[&tab=matches|practice]
//   ?reskin=leaderboard | ?reskin=profile[&auth=out|in] | ?reskin=deposit
// Native (Expo Go): edit DEFAULT_SCREEN below, or wire into App.js later.
import React from 'react';
import { View, Text, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import CountdownScreen from './CountdownScreen';
import AppShell from './AppShell';
import ResultsScreen from './ResultsScreen';
import WaitingScreen from './WaitingScreen';
import HistoryScreen from './HistoryScreen';
import LeaderboardScreen from './LeaderboardScreen';
import ProfileScreen from './ProfileScreen';
import DepositScreen from './DepositScreen';
import { COLORS, FONTS, useSenseFonts, useScale } from './theme';

// demo caption the locked reference render carries at the bottom of the
// question screen (kept out of the real QuestionScreen — preview parity only)
function DemoLabel({ text = 'FUSE RING' }) {
  const s = useScale();
  return (
    <Text style={{ position: 'absolute', bottom: 40 * s, left: 0, right: 0, textAlign: 'center',
      color: COLORS.creamDim, fontFamily: FONTS.interBold, fontSize: 30 * s,
      letterSpacing: 0.2 * 30 * s, zIndex: 15 }}>{text}</Text>
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
function ResultsLoop({ outcome, at, practice }) {
  const [k, setK] = React.useState(0);
  const d = RESULTS_DEMO[outcome] || RESULTS_DEMO.win;
  return (
    <ResultsScreen key={k} outcome={outcome} you={d.you} opp={d.opp} record={d.record} practice={!!practice}
      correctAnswer="CHEETAH" stake={practice ? 0 : 1.0} payout={practice ? 0 : 1.9} balanceBefore={24.5} streak={8}
      freezeAt={at || null} showClock onCycleEnd={at ? undefined : () => setK((x) => x + 1)} />
  );
}

/* ── demo data for the static screens (preview parity with batch5/6 mockups;
      the real app passes live props) ── */
const HISTORY_DEMO = {
  // questionIdx demos the per-card question-image thumbnail (owner 2026-06-16).
  pending: [{ yourTime: '1.42s', stake: '$1.00', lockoutSec: 103, questionIdx: 3 }],
  // RUNNING LEDGER (CJ spec 2026-06-11): one unified row per credit movement.
  // Match-derived rows carry questionIdx (thumbnail); deposit/bonus do not.
  feed: [
    { badge: 'stake', title: 'STAKED · VS ???', sub: 'PENDING — WAITING FOR OPPONENT', amount: '-$1.00', balance: '$24.50', questionIdx: 3 },
    { badge: 'win', label: 'PAYOUT', title: 'WON VS ALEX_R', sub: '1.42s VS 1.60s', amount: '+$0.95', balance: '$25.50', questionIdx: 11 },
    { badge: 'stake', title: 'STAKED · VS ALEX_R', sub: 'WON — SEE PAYOUT', amount: '-$0.50', balance: '$24.55', questionIdx: 11 },
    { badge: 'deposit', title: 'DEPOSIT', sub: 'CARD DEPOSIT', amount: '+$5.00', balance: '$25.05' },
    { badge: 'loss', label: 'STAKE', title: 'STAKED · VS SPEEDY_TOM', sub: 'LOST · 1.75s VS 1.55s', amount: '-$1.00', balance: '$20.05', questionIdx: 30 },
    { badge: 'draw', title: 'DRAW VS JUNGLE_CAT', sub: 'STAKE RETURNED', amount: '+$1.00', balance: '$21.05', questionIdx: 6 },
    { badge: 'refund', title: 'REFUNDED', sub: 'MATCH CANCELLED / EXPIRED', amount: '+$0.50', balance: '$20.05', questionIdx: 18 },
    { badge: 'bonus', title: 'BONUS', sub: 'DAILY CHECK-IN', amount: '+$0.25', balance: '$19.55' },
  ],
  practice: { w: 12, l: 5, d: 1, log: [
    { result: 'win', animal: 'CHEETAH', yourTime: '1.42s', ago: '2m' },
    { result: 'loss', animal: 'OCELOT', yourTime: '2.31s', ago: '1h' },
    { result: 'win', animal: 'CARACAL', yourTime: '1.18s', ago: '1d' },
  ] },
};
const LB_DEMO = {
  yourName: 'NIGHTOWL88',
  rows: [
    { rank: 1, name: 'LION_QUEEN', w: 95, l: 8, d: 2 },
    { rank: 2, name: 'SHADOW_FALCON', w: 82, l: 15, d: 1 },
    { rank: 3, name: 'ZEBRA_STALKER', w: 78, l: 19, d: 0 },
    { rank: 4, name: 'BERRY_GLUBT', w: 55, l: 12, d: 3 },
    { rank: 5, name: 'PARK_NEWSS', w: 55, l: 14, d: 1 },
    { rank: 6, name: 'SWIFT_CHEETAH', w: 45, l: 20, d: 2 },
    { rank: 7, name: 'NIGHTOWL88', w: 41, l: 12, d: 3 },
    { rank: 8, name: 'BRATH_TALZ', w: 40, l: 21, d: 0 },
  ],
};

const DEFAULT_SCREEN = 'home';

const qhas = (t) => !isNaN(t);   // ?t= present -> deterministic still (freeze)

export default function PreviewApp() {
  const ready = useSenseFonts();
  let which = DEFAULT_SCREEN, t = NaN, beat = null, ring = 'fuse';  // no ?t= -> NaN -> live ring
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    which = q.get('reskin') || DEFAULT_SCREEN;
    if (q.get('t') != null) t = parseFloat(q.get('t'));
    if (q.get('ring') === 'laser' || q.get('ring') === 'fuse') ring = q.get('ring');
    beat = q.get('beat');
    var outcome = q.get('outcome') || 'win';
    var at = q.get('at');
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (which === 'question') return (
    <View style={{ flex: 1 }}>
      <QuestionScreen showClock secondsLeft={isNaN(t) ? null : t} ringMode={ring} />
      <DemoLabel text={ring.toUpperCase() + ' RING'} />
    </View>
  );
  if (which === 'question-live') return <QuestionScreen showClock ringMode={ring} />;
  if (which === 'countdown') return <CountdownLoop freezeBeat={beat} />;
  if (which === 'results') return <ResultsLoop outcome={typeof outcome !== 'undefined' ? outcome : 'win'} at={typeof at !== 'undefined' ? at : null}
    practice={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('practice') === '1'} />;
  if (which === 'waiting') return <WaitingScreen showClock handle="NIGHTOWL88" freeze={qhas(t)} />;
  if (which === 'history') return (
    <AppShell activeTab="history" handle="NIGHTOWL88" pendingCount={1} showClock>
      <HistoryScreen tab={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'practice' ? 'practice' : 'matches'}
        pending={HISTORY_DEMO.pending} feed={HISTORY_DEMO.feed} practice={HISTORY_DEMO.practice} />
    </AppShell>
  );
  if (which === 'leaderboard') return (
    <AppShell activeTab="leaderboard" handle="NIGHTOWL88" showClock>
      <LeaderboardScreen rows={LB_DEMO.rows} yourName={LB_DEMO.yourName} />
    </AppShell>
  );
  if (which === 'profile') {
    const out = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('auth') === 'out';
    return (
      <AppShell activeTab="profile" handle="NIGHTOWL88" signedIn={!out} showClock>
        <ProfileScreen signedIn={!out} />
      </AppShell>
    );
  }
  if (which === 'deposit') return (
    <AppShell activeTab="profile" handle="NIGHTOWL88" showClock>
      <DepositScreen />
    </AppShell>
  );
  if (which === 'shell') return (
    <AppShell signedIn={false} pendingCount={2} activeTab="home" showClock>
      <ShellPlaceholder />
    </AppShell>
  );
  return <HomeScreen showClock />;
}
