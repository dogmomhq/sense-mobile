import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ImageBackground, Pressable, StyleSheet, SafeAreaView, StatusBar, ScrollView, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, getReasonText, formatTime } from './gameEngine.js';

// Sense mobile — faithful-match foundation: real tokens, Inter font, background
// image, frosted-glass cards, glossy PLAY button (from web App.css). Animations
// (confetti/shockwave/shake/race-bar) come in the next increment.

const TIME_LIMIT = 10000;
const C = { accent:'#6C63FF', accentDark:'#5A52E0', win:'#22C55E', lose:'#EF4444', draw:'#F59E0B',
  text:'#1A1A2E', text2:'#6B7B94', border:'rgba(0,0,0,0.08)', card:'rgba(255,255,255,0.95)', page:'#F0F0F3' };
const F = { r:'Inter_400Regular', m:'Inter_500Medium', s:'Inter_600SemiBold', b:'Inter_700Bold', x:'Inter_800ExtraBold', k:'Inter_900Black' };
const BG = 'https://dogmomhq.github.io/sense-react-staging/app/assets/background.jpg';
const RING = 58, CIRC = 2 * Math.PI * RING;

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black });
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
    Animated.timing(fade, { toValue: 0, duration: 130, useNativeDriver: true }).start();
    setTimeout(() => { next(); fade.setValue(0); Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start(); }, 140);
  }
  useEffect(() => {
    if (mode !== 'play' || !q) return;
    answered.current = false; startRef.current = Date.now(); setElapsed(0);
    timerRef.current = setInterval(() => {
      const e = Date.now() - startRef.current; setElapsed(e);
      if (e >= TIME_LIMIT) { clearInterval(timerRef.current); submit(-1); }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [q, mode]);
  useEffect(() => { if (mode === 'results') { pop.setValue(0); Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start(); } }, [mode]);

  function startPractice() { const f = getPracticeQuestion(used); setQ(f); setPicked(null); setResult(null); setComp(null); fadeTo(() => setMode('play')); }
  function submit(idx) {
    if (answered.current) return; answered.current = true; clearInterval(timerRef.current);
    const playerTime = idx === -1 ? TIME_LIMIT : Math.min(Date.now() - startRef.current, TIME_LIMIT);
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

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.page }} />;

  let body;
  if (mode === 'play' && q) {
    const secLeft = Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000));
    const progress = Math.min(elapsed / TIME_LIMIT, 1);
    const ringColor = secLeft <= 3 ? C.lose : secLeft <= 5 ? C.draw : C.accent;
    body = (
      <>
        <Brand sub="Practice vs Computer" />
        <View style={s.ringWrap}>
          <Svg width={140} height={140}>
            <Circle cx={70} cy={70} r={RING} stroke="rgba(0,0,0,0.07)" strokeWidth={10} fill="none" />
            <Circle cx={70} cy={70} r={RING} stroke={ringColor} strokeWidth={10} fill="none" strokeDasharray={CIRC} strokeDashoffset={CIRC * progress} strokeLinecap="round" transform="rotate(-90 70 70)" />
          </Svg>
          <View style={s.ringCenter}><Text style={[s.ringNum, { color: ringColor }]}>{secLeft}</Text></View>
        </View>
        <View style={s.card}><Image source={{ uri: q.image }} style={s.image} resizeMode="cover" /></View>
        <Text style={s.question}>{q.text}</Text>
        <View style={{ marginTop: 10 }}>
          {q.options.map((opt, idx) => {
            let bg = C.card, bd = C.border, col = C.text;
            if (picked !== null) { if (idx === q.correctIdx) { bg = '#DCFCE7'; bd = C.win; col = '#166534'; } else if (idx === picked) { bg = '#FEE2E2'; bd = C.lose; col = '#991B1B'; } }
            return (<Pressable key={idx} disabled={picked !== null} onPress={() => submit(idx)} style={[s.opt, { backgroundColor: bg, borderColor: bd }]}><Text style={[s.optText, { color: col }]}>{opt}</Text></Pressable>);
          })}
        </View>
      </>
    );
  } else if (mode === 'results' && result) {
    const win = result.result === 'win', draw = result.result === 'draw';
    const color = win ? C.win : draw ? C.draw : C.lose;
    const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    body = (
      <>
        <Brand sub="Practice vs Computer" />
        <Animated.View style={[s.banner, { backgroundColor: color, opacity: pop, transform: [{ scale }] }]}><Text style={s.bannerText}>{win ? 'You Won' : draw ? 'Draw' : 'You Lost'}</Text></Animated.View>
        <Text style={s.reason}>{getReasonText(result.reason)}</Text>
        <View style={s.rowCard}>
          <View style={s.rowItem}><Text style={s.rowLabel}>YOU</Text><Text style={s.rowVal}>{picked === -1 ? '—' : formatTime(comp.playerTime)}</Text></View>
          <View style={s.divider} />
          <View style={s.rowItem}><Text style={s.rowLabel}>COMPUTER</Text><Text style={s.rowVal}>{comp.isCorrect ? formatTime(comp.time) : 'Wrong'}</Text></View>
        </View>
        <Text style={s.correct}>Correct: <Text style={{ fontFamily: F.x, color: '#166534' }}>{q.options[q.correctIdx]}</Text></Text>
        <GlossyButton label="Play Again" onPress={playAgain} small />
        <Pressable style={s.ghost} onPress={goHome}><Text style={s.ghostText}>Home</Text></Pressable>
      </>
    );
  } else {
    const played = rec.wins + rec.losses + rec.draws;
    const acc = played ? Math.round((rec.wins / played) * 100) : 0;
    body = (
      <>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}>
          {tab === 'home' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 70 }}>
              <Text style={s.bigBrand}>SENSE</Text>
              <Text style={s.tagline}>How fast can you name the animal?</Text>
              <View style={s.recPill}><Text style={s.recPillText}>{rec.wins}W · {rec.losses}L · {rec.draws}D</Text></View>
              <View style={{ height: 30 }} />
              <GlossyButton label="PLAY" onPress={startPractice} />
              <Text style={s.note}>Free practice vs the computer. No wager.</Text>
            </View>
          ) : (
            <View style={{ paddingTop: 48 }}>
              <Text style={s.screenTitle}>Profile</Text>
              <View style={s.statGrid}><Stat label="Played" value={played} /><Stat label="Wins" value={rec.wins} /><Stat label="Accuracy" value={acc + '%'} /></View>
              <View style={s.statGrid}><Stat label="Losses" value={rec.losses} /><Stat label="Draws" value={rec.draws} /><Stat label="Streak" value={streak(history.current)} /></View>
              <Pressable style={s.toggleRow} onPress={() => setSound((x) => !x)}><Text style={s.toggleLabel}>Sound</Text><View style={[s.toggle, sound && { backgroundColor: C.accent }]}><View style={[s.knob, sound && { alignSelf: 'flex-end' }]} /></View></Pressable>
              <Text style={s.note}>Practice stats only. Paid stats stay separate (later).</Text>
            </View>
          )}
        </ScrollView>
        <View style={s.nav}><NavBtn label="Home" active={tab === 'home'} onPress={() => setTab('home')} /><NavBtn label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} /></View>
      </>
    );
  }

  return (
    <ImageBackground source={{ uri: BG }} resizeMode="cover" style={{ flex: 1, backgroundColor: C.page }}>
      <StatusBar barStyle="dark-content" />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <SafeAreaView style={{ flex: 1, paddingHorizontal: 22 }}>{body}</SafeAreaView>
      </Animated.View>
    </ImageBackground>
  );
}

function GlossyButton({ label, onPress, small }) {
  return (
    <Pressable onPress={onPress} style={{ width: '100%', maxWidth: small ? 320 : 360, marginTop: small ? 22 : 0 }}>
      <LinearGradient colors={['#555', '#333', '#1a1a1a', '#111', '#0a0a0a']} locations={[0, 0.2, 0.45, 0.55, 1]} style={[s.glossy, small && { paddingVertical: 16 }]}>
        <View style={s.glossyHi} />
        <Text style={[s.glossyText, small && { fontSize: 16, letterSpacing: 1 }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}
function streak(h) { let n = 0; for (let i = h.length - 1; i >= 0 && h[i]; i--) n++; return n; }
function Brand({ sub }) { return (<View style={s.header}><Text style={s.brand}>SENSE</Text>{sub ? <Text style={s.sub}>{sub}</Text> : null}</View>); }
function Stat({ label, value }) { return (<View style={s.stat}><Text style={s.statVal}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>); }
function NavBtn({ label, active, onPress }) { return (<Pressable style={s.navBtn} onPress={onPress}><Text style={[s.navText, active && { color: C.accent, fontFamily: F.x }]}>{label}</Text></Pressable>); }

const s = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 18 },
  brand: { fontSize: 28, fontFamily: F.k, letterSpacing: 4, color: C.accent },
  sub: { fontSize: 11, color: C.text2, letterSpacing: 2, marginTop: 2, fontFamily: F.s, textTransform: 'uppercase' },
  bigBrand: { fontSize: 56, fontFamily: F.k, letterSpacing: 7, color: C.accent },
  tagline: { fontSize: 15, color: C.text2, marginTop: 14, textAlign: 'center', fontFamily: F.m },
  recPill: { backgroundColor: 'rgba(108,99,255,0.10)', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9, marginTop: 22 },
  recPillText: { color: C.accent, fontFamily: F.x, fontSize: 14 },
  glossy: { borderRadius: 36, paddingVertical: 22, alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 15, shadowOffset: { width: 0, height: 4 }, elevation: 7 },
  glossyHi: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.13)' },
  glossyText: { color: '#fff', fontSize: 22, fontFamily: F.k, letterSpacing: 3 },
  note: { color: C.text2, fontSize: 12, marginTop: 22, textAlign: 'center', fontFamily: F.m },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 16, height: 140 },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontSize: 40, fontFamily: F.k },
  card: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', marginTop: 14, height: 220, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  image: { width: '100%', height: '100%' },
  question: { fontSize: 18, fontFamily: F.x, color: C.text, textAlign: 'center', marginTop: 16 },
  opt: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10 },
  optText: { fontSize: 16, fontFamily: F.b, textAlign: 'center' },
  banner: { borderRadius: 16, paddingVertical: 24, alignItems: 'center', marginTop: 30 },
  bannerText: { color: '#fff', fontSize: 28, fontFamily: F.k },
  reason: { textAlign: 'center', color: C.text2, fontSize: 14, marginTop: 14, fontFamily: F.b },
  rowCard: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, paddingVertical: 20, marginTop: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  rowItem: { flex: 1, alignItems: 'center' }, divider: { width: 1, height: 36, backgroundColor: C.border },
  rowLabel: { fontSize: 11, color: C.text2, letterSpacing: 1.5, fontFamily: F.s }, rowVal: { fontSize: 22, fontFamily: F.k, color: C.text, marginTop: 6 },
  correct: { textAlign: 'center', marginTop: 18, fontSize: 15, color: '#374151', fontFamily: F.m },
  ghost: { paddingVertical: 14, alignItems: 'center', marginTop: 4 }, ghostText: { color: C.text2, fontSize: 15, fontFamily: F.b },
  screenTitle: { fontSize: 28, fontFamily: F.k, color: C.text, marginBottom: 18 },
  statGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { backgroundColor: C.card, borderRadius: 16, paddingVertical: 20, flex: 1, marginHorizontal: 4, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  statVal: { fontSize: 24, fontFamily: F.k, color: C.accent }, statLabel: { fontSize: 12, color: C.text2, marginTop: 4, fontFamily: F.m },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 18, marginTop: 8 },
  toggleLabel: { fontSize: 16, fontFamily: F.x, color: C.text }, toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#D6D8E3', padding: 3, justifyContent: 'center' }, knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.95)', borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 14, paddingBottom: 28 },
  navBtn: { flex: 1, alignItems: 'center' }, navText: { fontSize: 14, color: C.text2, fontFamily: F.b },
});
