import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, getReasonText, formatTime } from './gameEngine.js';

// Sense mobile — M1: real practice mode using the actual @sense/core engine.
// Offline vs computer: real questions + real animal photos + 10s timer +
// adaptive computer opponent + win/loss/draw. (Vendored core copy for now;
// shared package comes with the monorepo step.)

const TIME_LIMIT = 10000;
const ACCENT = '#6C63FF';

export default function App() {
  const [screen, setScreen] = useState('play');
  const [q, setQ] = useState(() => getPracticeQuestion([]));
  const [used, setUsed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [comp, setComp] = useState(null);
  const [rec, setRec] = useState({ wins: 0, losses: 0, draws: 0 });
  const history = useRef([]);
  const startRef = useRef(Date.now());
  const timerRef = useRef(null);
  const answered = useRef(false);

  useEffect(() => {
    if (screen !== 'play') return;
    answered.current = false;
    startRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= TIME_LIMIT) { clearInterval(timerRef.current); submit(-1); }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [q, screen]);

  function submit(idx) {
    if (answered.current) return;
    answered.current = true;
    clearInterval(timerRef.current);
    const playerTime = idx === -1 ? TIME_LIMIT : (Date.now() - startRef.current);
    setPicked(idx);
    const c = getComputerAnswer(q.correctIdx, q.options.length, history.current);
    const r = determinePracticeResult(idx, playerTime, c.answer, c.time, q.correctIdx);
    setComp({ ...c, playerTime });
    setResult(r);
    history.current = [...history.current, r.result === 'win'];
    setRec((p) => ({
      wins: p.wins + (r.result === 'win' ? 1 : 0),
      losses: p.losses + (r.result === 'loss' ? 1 : 0),
      draws: p.draws + (r.result === 'draw' ? 1 : 0),
    }));
    setTimeout(() => setScreen('results'), 650);
  }

  function playAgain() {
    const nextUsed = [...used, q.questionIdx].slice(-10);
    setUsed(nextUsed);
    setQ(getPracticeQuestion(nextUsed));
    setPicked(null); setResult(null); setComp(null);
    setScreen('play');
  }

  const secondsLeft = Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000));
  const pct = Math.max(0, 100 - (elapsed / TIME_LIMIT) * 100);
  const barColor = secondsLeft <= 3 ? '#EF4444' : secondsLeft <= 5 ? '#F59E0B' : ACCENT;

  if (screen === 'results') {
    const win = result.result === 'win', draw = result.result === 'draw';
    const color = win ? '#22C55E' : draw ? '#F59E0B' : '#EF4444';
    const title = win ? 'You Won' : draw ? 'Draw' : 'You Lost';
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}><Text style={styles.brand}>SENSE</Text><Text style={styles.sub}>Practice vs Computer</Text></View>
        <View style={[styles.banner, { backgroundColor: color }]}><Text style={styles.bannerText}>{title}</Text></View>
        <Text style={styles.reason}>{getReasonText(result.reason)}</Text>
        <View style={styles.rowCard}>
          <View style={styles.rowItem}><Text style={styles.rowLabel}>You</Text><Text style={styles.rowVal}>{picked === -1 ? 'No answer' : formatTime(comp.playerTime)}</Text></View>
          <View style={styles.rowItem}><Text style={styles.rowLabel}>Computer</Text><Text style={styles.rowVal}>{comp.isCorrect ? formatTime(comp.time) : 'Wrong'}</Text></View>
        </View>
        <Text style={styles.correctLine}>Correct answer: <Text style={{ fontWeight: '800', color: '#166534' }}>{q.options[q.correctIdx]}</Text></Text>
        <Text style={styles.record}>{rec.wins}W · {rec.losses}L · {rec.draws}D</Text>
        <Pressable style={styles.primary} onPress={playAgain}><Text style={styles.primaryText}>Play Again →</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}><Text style={styles.brand}>SENSE</Text><Text style={styles.sub}>Practice vs Computer</Text></View>
      <View style={styles.timerRow}>
        <View style={styles.timerTrack}><View style={[styles.timerFill, { width: pct + '%', backgroundColor: barColor }]} /></View>
        <Text style={[styles.timerNum, { color: barColor }]}>{secondsLeft}s</Text>
      </View>
      <View style={styles.imageCard}>
        <Image source={{ uri: q.image }} style={styles.image} resizeMode="cover" />
      </View>
      <Text style={styles.question}>{q.text}</Text>
      <View style={styles.options}>
        {q.options.map((opt, idx) => {
          let bg = '#FFFFFF', border = '#E5E7EB', color = '#111827';
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 22 },
  header: { alignItems: 'center', marginTop: 20 },
  brand: { fontSize: 30, fontWeight: '900', letterSpacing: 4, color: ACCENT },
  sub: { fontSize: 12, color: '#9CA3AF', letterSpacing: 1.5, marginTop: 2 },
  timerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  timerTrack: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 4 },
  timerNum: { marginLeft: 10, fontSize: 15, fontWeight: '800', width: 34, textAlign: 'right' },
  imageCard: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginTop: 16, height: 240, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  image: { width: '100%', height: '100%' },
  question: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginTop: 16 },
  options: { marginTop: 14 },
  opt: { borderWidth: 2, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10 },
  optText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  banner: { borderRadius: 16, paddingVertical: 22, alignItems: 'center', marginTop: 26 },
  bannerText: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  reason: { textAlign: 'center', color: '#6B7280', fontSize: 14, marginTop: 12, fontWeight: '600' },
  rowCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 18, justifyContent: 'space-around', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rowItem: { alignItems: 'center' },
  rowLabel: { fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
  rowVal: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 4 },
  correctLine: { textAlign: 'center', marginTop: 18, fontSize: 15, color: '#374151' },
  record: { textAlign: 'center', marginTop: 10, fontSize: 14, color: '#6B7280', fontWeight: '700' },
  primary: { backgroundColor: '#111827', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
