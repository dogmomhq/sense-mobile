import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, SafeAreaView, StatusBar, ScrollView, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, getReasonText, formatTime } from './gameEngine.js';

// Sense mobile — M3: polish pass. Circular timer ring, refined theme, result
// reveal animation, screen fade, time clamp. Polish only (no online play).

const TIME_LIMIT = 10000;
const ACCENT = '#6C63FF';
const INK = '#0F1222';
const RING = 58, CIRC = 2 * Math.PI * RING;

export default function App() {
  const [tab, setTab] = useState('home');
  const [mode, setMode] = useState(null);
  const [rec, setRec] = useState({ wins: 0, losses: 0, draws: 0 });
  const [sound, setSound] = useState(false);
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
  const fade = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current;

  function fadeTo(next) {
    Animated.timing(fade, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  }

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

  useEffect(() => {
    if (mode === 'results') {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    }
  }, [mode]);

  function startPractice() { const f = getPracticeQuestion(used); setQ(f); setPicked(null); setResult(null); setComp(null); fadeTo(() => setMode('play')); }
  function submit(idx) {
    if (answered.current) return;
    answered.current = true;
    clearInterval(timerRef.current);
    const playerTime = idx === -1 ? TIME_LIMIT : Math.min(Date.now() - startRef.current, TIME_LIMIT); // clamp <= limit
    setPicked(idx);
    const c = getComputerAnswer(q.correctIdx, q.options.length, history.current);
    const r = determinePracticeResult(idx, playerTime, c.answer, c.time, q.correctIdx);
    setComp({ ...c, playerTime }); setResult(r);
    history.current = [...history.current, r.result === 'win'];
    setRec((p) => ({ wins: p.wins + (r.result === 'win'), losses: p.losses + (r.result === 'loss'), draws: p.draws + (r.result === 'draw') }));
    setTimeout(() => fadeTo(() => setMode('results')), 600);
  }
  function playAgain() { const nu = [...used, q.questionIdx].slice(-10); setUsed(nu); const f = getPracticeQuestion(nu); setQ(f); setPicked(null); setResult(null); setComp(null); fadeTo(() => setMode('play')); }
  function goHome() { fadeTo(() => { setMode(null); setTab('home'); }); }

  // ---------- PLAY ----------
  if (mode === 'play' && q) {
    const secLeft = Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000));
    const progress = Math.min(elapsed / TIME_LIMIT, 1);
    const ringColor = secLeft <= 3 ? '#EF4444' : secLeft <= 5 ? '#F59E0B' : ACCENT;
    return (
      <Animated.View style={[styles.flex, { opacity: fade }]}>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="dark-content" />
          <Brand sub="Practice vs Computer" />
          <View style={styles.ringWrap}>
            <Svg width={140} height={140}>
              <Circle cx={70} cy={70} r={RING} stroke="#ECEDF5" strokeWidth={10} fill="none" />
              <Circle cx={70} cy={70} r={RING} stroke={ringColor} strokeWidth={10} fill="none"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * progress} strokeLinecap="round"
                transform="rotate(-90 70 70)" />
            </Svg>
            <View style={styles.ringCenter}><Text style={[styles.ringNum, { color: ringColor }]}>{secLeft}</Text></View>
          </View>
          <View style={styles.imageCard}><Image source={{ uri: q.image }} style={styles.image} resizeMode="cover" /></View>
          <Text style={styles.question}>{q.text}</Text>
          <View style={{ marginTop: 10 }}>
            {q.options.map((opt, idx) => {
              let bg = '#FFF', border = '#E9EAF2', color = INK;
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
      </Animated.View>
    );
  }

  // ---------- RESULTS ----------
  if (mode === 'results' && result) {
    const win = result.result === 'win', draw = result.result === 'draw';
    const color = win ? '#22C55E' : draw ? '#F59E0B' : '#EF4444';
    const title = win ? 'You Won' : draw ? 'Draw' : 'You Lost';
    const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
    return (
      <Animated.View style={[styles.flex, { opacity: fade }]}>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="dark-content" />
          <Brand sub="Practice vs Computer" />
          <Animated.View style={[styles.banner, { backgroundColor: color, opacity: pop, transform: [{ scale }] }]}>
            <Text style={styles.bannerText}>{title}</Text>
          </Animated.View>
          <Text style={styles.reason}>{getReasonText(result.reason)}</Text>
          <View style={styles.rowCard}>
            <View style={styles.rowItem}><Text style={styles.rowLabel}>YOU</Text><Text style={styles.rowVal}>{picked === -1 ? '—' : formatTime(comp.playerTime)}</Text></View>
            <View style={styles.divider} />
            <View style={styles.rowItem}><Text style={styles.rowLabel}>COMPUTER</Text><Text style={styles.rowVal}>{comp.isCorrect ? formatTime(comp.time) : 'Wrong'}</Text></View>
          </View>
          <Text style={styles.correctLine}>Correct: <Text style={{ fontWeight: '800', color: '#166534' }}>{q.options[q.correctIdx]}</Text></Text>
          <Pressable style={styles.primary} onPress={playAgain}><Text style={styles.primaryText}>Play Again</Text></Pressable>
          <Pressable style={styles.ghost} onPress={goHome}><Text style={styles.ghostText}>Home</Text></Pressable>
        </SafeAreaView>
      </Animated.View>
    );
  }

  // ---------- HOME / PROFILE ----------
  const played = rec.wins + rec.losses + rec.draws;
  const acc = played ? Math.round((rec.wins / played) * 100) : 0;
  return (
    <Animated.View style={[styles.flex, { opacity: fade }]}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 92 }}>
          {tab === 'home' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 64 }}>
              <Text style={styles.bigBrand}>SENSE</Text>
              <View style={styles.accentBar} />
              <Text style={styles.tagline}>How fast can you name the animal?</Text>
              <View style={styles.recPill}><Text style={styles.recPillText}>{rec.wins}W · {rec.losses}L · {rec.draws}D</Text></View>
              <Pressable style={styles.cta} onPress={startPractice}><Text style={styles.ctaText}>Play Practice</Text></Pressable>
              <Text style={styles.note}>Free practice vs the computer. No wager.</Text>
            </View>
          ) : (
            <View style={{ paddingTop: 44 }}>
              <Text style={styles.screenTitle}>Profile</Text>
              <View style={styles.statGrid}><Stat label="Played" value={played} /><Stat label="Wins" value={rec.wins} /><Stat label="Accuracy" value={acc + '%'} /></View>
              <View style={styles.statGrid}><Stat label="Losses" value={rec.losses} /><Stat label="Draws" value={rec.draws} /><Stat label="Streak" value={streak(history.current)} /></View>
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
    </Animated.View>
  );
}

function streak(h) { let s = 0; for (let i = h.length - 1; i >= 0 && h[i]; i--) s++; return s; }
function Brand({ sub }) { return (<View style={styles.header}><Text style={styles.brand}>SENSE</Text>{sub ? <Text style={styles.sub}>{sub}</Text> : null}</View>); }
function Stat({ label, value }) { return (<View style={styles.stat}><Text style={styles.statVal}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>); }
function NavBtn({ label, active, onPress }) { return (<Pressable style={styles.navBtn} onPress={onPress}><Text style={[styles.navText, active && { color: ACCENT, fontWeight: '800' }]}>{label}</Text></Pressable>); }

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F7F8FC' },
  safe: { flex: 1, backgroundColor: '#F7F8FC', paddingHorizontal: 22 },
  header: { alignItems: 'center', marginTop: 18 },
  brand: { fontSize: 28, fontWeight: '900', letterSpacing: 4, color: ACCENT },
  sub: { fontSize: 11, color: '#9AA0B4', letterSpacing: 2, marginTop: 2, textTransform: 'uppercase' },
  bigBrand: { fontSize: 54, fontWeight: '900', letterSpacing: 7, color: ACCENT },
  accentBar: { width: 46, height: 5, borderRadius: 3, backgroundColor: ACCENT, marginTop: 14, opacity: 0.5 },
  tagline: { fontSize: 15, color: '#6B7180', marginTop: 16, textAlign: 'center' },
  recPill: { backgroundColor: '#EEF0FF', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9, marginTop: 22 },
  recPillText: { color: ACCENT, fontWeight: '800', fontSize: 14 },
  cta: { backgroundColor: ACCENT, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 60, marginTop: 28, shadowColor: ACCENT, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  ctaText: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  note: { color: '#9AA0B4', fontSize: 12, marginTop: 20, textAlign: 'center' },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 16, height: 140 },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontSize: 40, fontWeight: '900' },
  imageCard: { backgroundColor: '#FFF', borderRadius: 22, overflow: 'hidden', marginTop: 14, height: 220, shadowColor: '#0F1222', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  image: { width: '100%', height: '100%' },
  question: { fontSize: 18, fontWeight: '800', color: INK, textAlign: 'center', marginTop: 16 },
  opt: { borderWidth: 2, borderRadius: 15, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10 },
  optText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  banner: { borderRadius: 18, paddingVertical: 26, alignItems: 'center', marginTop: 30 },
  bannerText: { color: '#FFF', fontSize: 30, fontWeight: '900', letterSpacing: 0.5 },
  reason: { textAlign: 'center', color: '#6B7180', fontSize: 14, marginTop: 14, fontWeight: '700' },
  rowCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 18, paddingVertical: 20, marginTop: 20, alignItems: 'center', shadowColor: '#0F1222', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  rowItem: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 36, backgroundColor: '#ECEDF5' },
  rowLabel: { fontSize: 11, color: '#9AA0B4', letterSpacing: 1.5 },
  rowVal: { fontSize: 22, fontWeight: '900', color: INK, marginTop: 6 },
  correctLine: { textAlign: 'center', marginTop: 20, fontSize: 15, color: '#374151' },
  primary: { backgroundColor: INK, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 26 },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  ghost: { paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  ghostText: { color: '#6B7180', fontSize: 15, fontWeight: '700' },
  screenTitle: { fontSize: 28, fontWeight: '900', color: INK, marginBottom: 18 },
  statGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { backgroundColor: '#FFF', borderRadius: 18, paddingVertical: 20, flex: 1, marginHorizontal: 4, alignItems: 'center', shadowColor: '#0F1222', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statVal: { fontSize: 24, fontWeight: '900', color: ACCENT },
  statLabel: { fontSize: 12, color: '#9AA0B4', marginTop: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginTop: 8 },
  toggleLabel: { fontSize: 16, fontWeight: '800', color: INK },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#D6D8E3', padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF' },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EEF0F5', paddingVertical: 14, paddingBottom: 28 },
  navBtn: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 14, color: '#9AA0B4', fontWeight: '700' },
});
