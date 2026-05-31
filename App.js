import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, getReasonText, formatTime } from './gameEngine.js';

// Sense mobile — M2: app shell (Home + bottom nav + Profile) around the real
// practice game from @sense/core. State-based routing (mirrors the web app);
// Expo Router comes with the monorepo step. Offline, no backend.

const TIME_LIMIT = 10000;
const ACCENT = '#6C63FF';
const INK = '#111827';

export default function App() {
  const [tab, setTab] = useState('home');        // home | profile
  const [mode, setMode] = useState(null);        // null | play | results
  const [rec, setRec] = useState({ wins: 0, losses: 0, draws: 0 });
  const [sound, setSound] = useState(false);

  // practice round state
  const [q, setQ] = useState(null);
  const [used, setUsed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [comp, setComp] = useState(null);
  const history = useRef([]);
  const startRef = useRef(0);
  const timerRef = useRef(null);
  const answered = useRef(false);

  useEffect(() => {
    if (mode !== 'play' || !q) return;
    answered.current = false;
    startRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= TIME_LIMIT) { clearInterval(timerRef.current); submit(-1); }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [q, mode]);

  function startPractice() {
    const first = getPracticeQuestion(used);
    setQ(first); setPicked(null); setResult(null); setComp(null);
    setMode('play');
  }
  function submit(idx) {
    if (answered.current) return;
    answered.current = true;
    clearInterval(timerRef.current);
    const playerTime = idx === -1 ? TIME_LIMIT : (Date.now() - startRef.current);
    setPicked(idx);
    const c = getComputerAnswer(q.correctIdx, q.options.length, history.current);
    const r = determinePracticeResult(idx, playerTime, c.answer, c.time, q.correctIdx);
    setComp({ ...c, playerTime }); setResult(r);
    history.current = [...history.current, r.result === 'win'];
    setRec((p) => ({
      wins: p.wins + (r.result === 'win' ? 1 : 0),
      losses: p.losses + (r.result === 'loss' ? 1 : 0),
      draws: p.draws + (r.result === 'draw' ? 1 : 0),
    }));
    setTimeout(() => setMode('results'), 650);
  }
  function playAgain() {
    const nextUsed = [...used, q.questionIdx].slice(-10);
    setUsed(nextUsed);
    setQ(getPracticeQuestion(nextUsed));
    setPicked(null); setResult(null); setComp(null);
    setMode('play');
  }
  function goHome() { setMode(null); setTab('home'); }

  // ---------- PLAY ----------
  if (mode === 'play' && q) {
    const secLeft = Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000));
    const pct = Math.max(0, 100 - (elapsed / TIME_LIMIT) * 100);
    const barColor = secLeft <= 3 ? '#EF4444' : secLeft <= 5 ? '#F59E0B' : ACCENT;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <Brand sub="Practice vs Computer" />
        <View style={styles.timerRow}>
          <View style={styles.timerTrack}><View style={[styles.timerFill, { width: pct + '%', backgroundColor: barColor }]} /></View>
          <Text style={[styles.timerNum, { color: barColor }]}>{secLeft}s</Text>
        </View>
        <View style={styles.imageCard}><Image source={{ uri: q.image }} style={styles.image} resizeMode="cover" /></View>
        <Text style={styles.question}>{q.text}</Text>
        <View style={{ marginTop: 12 }}>
          {q.options.map((opt, idx) => {
            let bg = '#FFF', border = '#E5E7EB', color = INK;
            if (picked !== null) {
              if (idx === q.correctIdx) { bg = '#DCFCE7'; border = '#22C55E'; color = '#166534'; }
              else if (idx === picked) { bg = '#FEE2E2'; border = '#EF4444'; color = '#991B1B'; }
            }
            return (
              <Pressable key={idx} disabled={picked !== null} onPress={() => submit(idx)} style={[styles.opt, { backgroundColor: bg, borderColor: border }]}>
                <Text style={[styles.optText, { color }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }

  // ---------- RESULTS ----------
  if (mode === 'results' && result) {
    const win = result.result === 'win', draw = result.result === 'draw';
    const color = win ? '#22C55E' : draw ? '#F59E0B' : '#EF4444';
    const title = win ? 'You Won' : draw ? 'Draw' : 'You Lost';
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <Brand sub="Practice vs Computer" />
        <View style={[styles.banner, { backgroundColor: color }]}><Text style={styles.bannerText}>{title}</Text></View>
        <Text style={styles.reason}>{getReasonText(result.reason)}</Text>
        <View style={styles.rowCard}>
          <View style={styles.rowItem}><Text style={styles.rowLabel}>You</Text><Text style={styles.rowVal}>{picked === -1 ? '—' : formatTime(comp.playerTime)}</Text></View>
          <View style={styles.rowItem}><Text style={styles.rowLabel}>Computer</Text><Text style={styles.rowVal}>{comp.isCorrect ? formatTime(comp.time) : 'Wrong'}</Text></View>
        </View>
        <Text style={styles.correctLine}>Correct: <Text style={{ fontWeight: '800', color: '#166534' }}>{q.options[q.correctIdx]}</Text></Text>
        <Pressable style={styles.primary} onPress={playAgain}><Text style={styles.primaryText}>Play Again →</Text></Pressable>
        <Pressable style={styles.ghost} onPress={goHome}><Text style={styles.ghostText}>Home</Text></Pressable>
      </SafeAreaView>
    );
  }

  // ---------- HOME / PROFILE (with bottom nav) ----------
  const played = rec.wins + rec.losses + rec.draws;
  const acc = played ? Math.round((rec.wins / played) * 100) : 0;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 90 }}>
        {tab === 'home' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
            <Text style={styles.bigBrand}>SENSE</Text>
            <Text style={styles.tagline}>How fast can you name the animal?</Text>
            <View style={styles.recPill}><Text style={styles.recPillText}>{rec.wins}W · {rec.losses}L · {rec.draws}D</Text></View>
            <Pressable style={styles.cta} onPress={startPractice}><Text style={styles.ctaText}>Play Practice</Text></Pressable>
            <Text style={styles.note}>Free practice vs the computer. No wager.</Text>
          </View>
        ) : (
          <View style={{ paddingTop: 40 }}>
            <Text style={styles.screenTitle}>Profile</Text>
            <View style={styles.statGrid}>
              <Stat label="Played" value={played} />
              <Stat label="Wins" value={rec.wins} />
              <Stat label="Accuracy" value={acc + '%'} />
            </View>
            <View style={styles.statGrid}>
              <Stat label="Losses" value={rec.losses} />
              <Stat label="Draws" value={rec.draws} />
              <Stat label="Streak" value={streak(history.current)} />
            </View>
            <Pressable style={styles.toggleRow} onPress={() => setSound((s) => !s)}>
              <Text style={styles.toggleLabel}>Sound</Text>
              <View style={[styles.toggle, sound && { backgroundColor: ACCENT }]}><View style={[styles.knob, sound && { alignSelf: 'flex-end' }]} /></View>
            </Pressable>
            <Text style={styles.note}>Practice stats only. Paid stats stay separate (later).</Text>
          </View>
        )}
      </ScrollView>
      <View style={styles.nav}>
        <NavBtn label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <NavBtn label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} />
      </View>
    </SafeAreaView>
  );
}

function streak(h) { let s = 0; for (let i = h.length - 1; i >= 0 && h[i]; i--) s++; return s; }
function Brand({ sub }) { return (<View style={styles.header}><Text style={styles.brand}>SENSE</Text>{sub ? <Text style={styles.sub}>{sub}</Text> : null}</View>); }
function Stat({ label, value }) { return (<View style={styles.stat}><Text style={styles.statVal}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>); }
function NavBtn({ label, active, onPress }) { return (<Pressable style={styles.navBtn} onPress={onPress}><Text style={[styles.navText, active && { color: ACCENT, fontWeight: '800' }]}>{label}</Text></Pressable>); }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 22 },
  header: { alignItems: 'center', marginTop: 20 },
  brand: { fontSize: 30, fontWeight: '900', letterSpacing: 4, color: ACCENT },
  sub: { fontSize: 12, color: '#9CA3AF', letterSpacing: 1.5, marginTop: 2 },
  bigBrand: { fontSize: 52, fontWeight: '900', letterSpacing: 6, color: ACCENT },
  tagline: { fontSize: 15, color: '#6B7280', marginTop: 10, textAlign: 'center' },
  recPill: { backgroundColor: '#EEF0FF', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginTop: 22 },
  recPillText: { color: ACCENT, fontWeight: '800', fontSize: 14 },
  cta: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 56, marginTop: 26, shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  ctaText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  note: { color: '#9CA3AF', fontSize: 12, marginTop: 18, textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  timerTrack: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 4 },
  timerNum: { marginLeft: 10, fontSize: 15, fontWeight: '800', width: 34, textAlign: 'right' },
  imageCard: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginTop: 16, height: 230, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  image: { width: '100%', height: '100%' },
  question: { fontSize: 18, fontWeight: '700', color: INK, textAlign: 'center', marginTop: 16 },
  opt: { borderWidth: 2, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10 },
  optText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  banner: { borderRadius: 16, paddingVertical: 22, alignItems: 'center', marginTop: 26 },
  bannerText: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  reason: { textAlign: 'center', color: '#6B7280', fontSize: 14, marginTop: 12, fontWeight: '600' },
  rowCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 18, justifyContent: 'space-around', elevation: 2 },
  rowItem: { alignItems: 'center' },
  rowLabel: { fontSize: 12, color: '#9CA3AF', letterSpacing: 1 },
  rowVal: { fontSize: 20, fontWeight: '800', color: INK, marginTop: 4 },
  correctLine: { textAlign: 'center', marginTop: 18, fontSize: 15, color: '#374151' },
  primary: { backgroundColor: INK, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  ghost: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  ghostText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  screenTitle: { fontSize: 26, fontWeight: '900', color: INK, marginBottom: 18 },
  statGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 18, flex: 1, marginHorizontal: 4, alignItems: 'center', elevation: 2 },
  statVal: { fontSize: 24, fontWeight: '900', color: ACCENT },
  statLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 8 },
  toggleLabel: { fontSize: 16, fontWeight: '700', color: INK },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#D1D5DB', padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingVertical: 14, paddingBottom: 26 },
  navBtn: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
});
