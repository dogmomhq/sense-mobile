// ── QUESTION (1:1 port of anim_gallery/question_ring_demo.html, fuse ring) ─
// Full-bleed photo, same sticky v56 header, stake pill, laser-fuse timer
// ring, 2x2 Anton answer grid. No bottom nav.
// `secondsLeft` prop freezes the ring (previews/tests); omit it and the
// ring burns live 10.0 -> 0.0 at ~60fps via requestAnimationFrame.
import React, { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import StakePill from './components/StakePill';
import TimerRing from './components/TimerRing';
import AnswerGrid from './components/AnswerGrid';
import CoverPhoto from './components/CoverPhoto';
import { useScale } from './theme';

const DEMO_PHOTO = require('../assets/cheetah.jpeg');

export default function QuestionScreen({
  secondsLeft = null,                       // freeze the ring at this time; null = run live
  answers = ['CHEETAH', 'LEOPARD', 'JAGUAR', 'COUGAR'],
  photo = DEMO_PHOTO, photoW = 768, photoH = 1376,
  stake = '$1.00 · WIN $1.90',
  streak = 8, balance = '$24.50',
  onAnswer, onTimeout, showClock = false,
  ringMode = 'fuse',                        // 'fuse' | 'laser' — which timer-ring engine
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();
  const [t, setT] = useState(10);
  const [locked, setLocked] = useState(null);
  const raf = useRef(null);

  useEffect(() => {
    if (secondsLeft != null) return;        // frozen mode
    const start = Date.now();
    const tick = () => {
      const left = Math.max(0, 10 - (Date.now() - start) / 1000);
      setT(left);
      if (left > 0) raf.current = requestAnimationFrame(tick);
      else if (onTimeout) onTimeout();
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [secondsLeft]);

  const tLeft = secondsLeft != null ? secondsLeft : t;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />

      {/* full-bleed photo (center top / cover) */}
      <CoverPhoto source={photo} naturalW={photoW} naturalH={photoH} boxW={width} boxH={height}
        style={{ position: 'absolute', top: 0, left: 0 }} />

      {/* same olive top fade as home */}
      <LinearGradient pointerEvents="none"
        colors={['rgba(30,34,26,0.93)', 'rgba(30,34,26,0.91)', 'rgba(30,34,26,0.55)', 'rgba(30,34,26,0.25)', 'rgba(30,34,26,0)']}
        locations={[0, 0.5, 0.64, 0.78, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.2, zIndex: 2 }} />

      {/* bottom fade for answer legibility */}
      <LinearGradient pointerEvents="none"
        colors={['rgba(11,15,10,0)', 'rgba(11,15,10,0.7)', 'rgba(11,15,10,0.96)']}
        locations={[0, 0.55, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.38, zIndex: 2 }} />

      <GlassHeader streak={streak} balance={balance} showClock={showClock} />
      <StakePill text={stake} />
      <TimerRing secondsLeft={tLeft} mode={ringMode} />
      <AnswerGrid answers={answers} lockedIndex={locked}
        onAnswer={(i, label) => { setLocked(i); if (onAnswer) onAnswer(i, label); }} />
    </View>
  );
}
