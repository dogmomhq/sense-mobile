// ── QUESTION (1:1 port of anim_gallery/question_ring_demo.html, fuse ring) ─
// Full-bleed photo, same sticky v56 header, stake pill, laser-fuse timer
// ring, 2x2 Anton answer grid. No bottom nav.
// `secondsLeft` prop freezes the ring (previews/tests); omit it and the
// ring burns live 10.0 -> 0.0 at ~60fps via requestAnimationFrame.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import StakePill from './components/StakePill';
import TimerRing from './components/TimerRing';
import AnswerGrid from './components/AnswerGrid';
import CoverPhoto from './components/CoverPhoto';
import { VideoView, useVideoPlayer } from 'expo-video'; // 1.4.0: looping UGC clip behind the question
import { useScale } from './theme';

const DEMO_PHOTO = require('../assets/cheetah.jpeg');

const TIMEDEBUG = typeof window !== 'undefined' && window.location && /[?&]timedebug=1/.test(window.location.search || '');

export default function QuestionScreen({
  secondsLeft = null,                       // freeze the ring at this time; null = run live
  startTsRef = null,                        // ref holding the AUTHORITATIVE round-start t0 (App.js startRef — the same timestamp the scored clientTime subtracts from). When provided, the live ring derives secondsLeft = 10 - (Date.now()-t0)/1000 from it every frame, so display and score cannot diverge.
  answers = ['CHEETAH', 'LEOPARD', 'JAGUAR', 'COUGAR'],
  photo = DEMO_PHOTO, photoW = 768, photoH = 1376,
  videoUri = null,                          // 1.4.0: local file uri of the downloaded clip; null = still image only
  stake = '$1.00 · WIN $1.90',
  streak = 8, balance = '$24.50',
  onAnswer, onTimeout, showClock = false,
  concealed = false,                        // countdown conceal: photo+answers render at opacity 0 (decoded, never painted) until the countdown ends
  ringMode = 'fuse',                        // 'fuse' | 'laser' — which timer-ring engine
  timingDbgRef = null,                      // ?timedebug=1: { flipTs, goTs } from ReskinApp (goAnchor delta) + last press latency written here
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();
  const [t, setT] = useState(10);
  // 1.4.0 video: player is created once (null source ok); source swaps in when the
  // download lands. Sound ON (CJ 2026-08-21). Paused while concealed — audio during
  // the countdown would leak the animal before the reveal.
  const player = useVideoPlayer(videoUri, (p) => { p.loop = true; p.muted = false; });
  useEffect(() => {
    try { if (!videoUri) return; if (concealed) player.pause(); else player.play(); } catch (e) {}
  }, [videoUri, concealed]);
  useEffect(() => { // B71 watchdog: sfx/interruptions can pause the AVPlayer — resume within 1s
    if (!videoUri || concealed) return;
    const iv = setInterval(() => { try { if (!player.playing) player.play(); } catch (e) {} }, 1000);
    return () => clearInterval(iv);
  }, [videoUri, concealed]);
  const [locked, setLocked] = useState(null);
  const raf = useRef(null);

  useEffect(() => {
    if (secondsLeft != null) return;        // frozen mode
    const localStart = Date.now();          // fallback only (previews without a game clock)
    let last = 10.001;
    const tick = () => {
      // read the scoring t0 PER TICK (App.js sets startRef in an effect that
      // runs after this child effect — raf fires after all effects, so the
      // first frame already sees the fresh value)
      const t0 = startTsRef && startTsRef.current ? startTsRef.current : localStart;
      const left = Math.max(0, Math.min(10, 10 - (Date.now() - t0) / 1000));
      // 30Hz setState cap: the ring sweeps 36 deg/s, so 33ms steps are
      // sub-pixel; halves the JS/SVG re-render cost of the live screen
      if (left === 0 || last - left >= 1 / 30) { last = left; setT(left); }
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
        style={{ position: 'absolute', top: 0, left: 0, opacity: concealed ? 0 : 1 }} />

      {/* 1.4.0: looping clip over the still (photo stays underneath as the instant poster) */}
      {videoUri ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height, opacity: concealed ? 0 : 1 }}>
          <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
        </View>
      ) : null}

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
      {/* frozen (answered) readout shows hundredths so it equals the scored
          time exactly; live readout stays tenths */}
      <TimerRing secondsLeft={tLeft} mode={ringMode} precision={secondsLeft != null ? 2 : 1} />
      {/* conceal wrapper (2026-07-02): answers invisible until countdown ends — same
          geometry (full-screen absolute, box-none), zero repaint cost on reveal */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15, opacity: concealed ? 0 : 1 }}>
        <AnswerGrid answers={answers} lockedIndex={locked}
          onAnswer={(i, label, pressTs) => {
            if (timingDbgRef && timingDbgRef.current) timingDbgRef.current.press = { pressTs, submitTs: Date.now() };
            setLocked(i); if (onAnswer) onAnswer(i, label, pressTs);
          }} />
      </View>
      {TIMEDEBUG && <TimeDebug startTsRef={startTsRef} secondsLeft={secondsLeft} tLeft={tLeft} timingDbgRef={timingDbgRef} />}
    </View>
  );
}

// ?timedebug=1 — overlays the t0 source, the scoring clock's elapsed, and the
// ring's displayed remaining so display/score divergence is visible live.
// Param-gated, renders nothing otherwise; safe to leave in.
function TimeDebug({ startTsRef, secondsLeft, tLeft, timingDbgRef }) {
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force(n => n + 1), 100); return () => clearInterval(i); }, []);
  const t0 = startTsRef && startTsRef.current ? startTsRef.current : null;
  const scoringElapsed = t0 ? Math.max(0, (Date.now() - t0) / 1000) : null;
  const ringElapsed = 10 - tLeft;
  const dbg = (timingDbgRef && timingDbgRef.current) || {};
  const goDelta = dbg.flipTs && dbg.goTs ? dbg.goTs - dbg.flipTs : null;         // rendered GO vs scheduled flip
  const pressLat = dbg.press && dbg.press.pressTs ? dbg.press.submitTs - dbg.press.pressTs : null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4, zIndex: 99,
      backgroundColor: 'rgba(0,0,0,0.75)', padding: 6, borderRadius: 4 }}>
      <Text style={{ color: '#9eff57', fontSize: 11, fontFamily: 'monospace' }}>
        {`t0: ${t0 ? 'startRef(scoring) ' + t0 : 'none (local fallback)'}\n`
         + `scoring elapsed: ${scoringElapsed != null ? scoringElapsed.toFixed(2) + 's' : '—'}\n`
         + `ring shows left: ${tLeft.toFixed(2)}s (elapsed ${ringElapsed.toFixed(2)}s)\n`
         + `mode: ${secondsLeft != null ? 'FROZEN @' + secondsLeft : 'LIVE'}\n`
         + `delta(score-ring): ${scoringElapsed != null ? (scoringElapsed - ringElapsed).toFixed(2) + 's' : '—'}\n`
         + `goAnchor (rendered-scheduled): ${goDelta != null ? '+' + goDelta + 'ms' : '—'}\n`
         + `last press→submit: ${pressLat != null ? pressLat + 'ms' : '—'}`}
      </Text>
    </View>
  );
}
