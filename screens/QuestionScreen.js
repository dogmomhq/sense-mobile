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
import TimerRing, { ROUND_S } from './components/TimerRing';
import AnswerGrid from './components/AnswerGrid';
import CoverPhoto from './components/CoverPhoto';
import { VideoView } from 'expo-video'; // 1.4.0: looping UGC clip behind the question
import { useScale } from './theme';

const DEMO_PHOTO = require('../assets/cheetah.jpeg');

const TIMEDEBUG = typeof window !== 'undefined' && window.location && /[?&]timedebug=1/.test(window.location.search || '');

export default function QuestionScreen({
  secondsLeft = null,                       // freeze the ring at this time; null = run live
  startTsRef = null,                        // ref holding the AUTHORITATIVE round-start t0 (App.js startRef — the same timestamp the scored clientTime subtracts from). When provided, the live ring derives secondsLeft = ROUND_S - (Date.now()-t0)/1000 from it every frame, so display and score cannot diverge.
  answers = ['CHEETAH', 'LEOPARD', 'JAGUAR', 'COUGAR'],
  photo = DEMO_PHOTO, photoW = 768, photoH = 1376,
  videoUri = null,                          // 1.4.0: local file uri of the downloaded clip; null = still image only
  videoExpected = false,                    // B100: a clip is coming — never paint the still, even while videoUri is null
  player = null,                            // B90: the ONE shared player (owned by ReskinApp) — survives into waiting/results so the clip never restarts at screen changes
  stake = '$1.00 · WIN $1.90',
  streak = 8, balance = '$24.50', avatar = undefined, // B89: home avatar everywhere
  onAnswer, onTimeout, showClock = false,
  concealed = false,                        // countdown conceal: photo+answers render at opacity 0 (decoded, never painted) until the countdown ends
  ringMode = 'fuse',                        // 'fuse' | 'laser' — which timer-ring engine
  timingDbgRef = null,                      // ?timedebug=1: { flipTs, goTs } from ReskinApp (goAnchor delta) + last press latency written here
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();
  const [t, setT] = useState(ROUND_S);
  // 1.4.0 video: player is created once (null source ok); source swaps in when the
  // download lands. Sound ON (CJ 2026-08-21). Paused while concealed — audio during
  // the countdown would leak the animal before the reveal.
  // B77: hook source pinned to null — passing videoUri made expo-video do a
  // SYNCHRONOUS replace() on the main thread the moment the download landed,
  // freezing ring+UI ~700ms mid-round (B76 recording: 8.0->7.7 stick ->6.9 leap).
  // replaceAsync loads off-thread; vidReady gates the overlay so no black flash.
  // B84 ROOT CAUSE (frame-by-frame forensics of CJ's 8/22 recording, 60fps):
  //   reveal 0ms -> digit ticks fine -> at +330ms MAIN THREAD blocks ~800ms
  //   (digit stuck 7.7; video KEEPS rendering — iOS render server is separate)
  //   -> clip audio cuts mid-block -> main thread recovers (digit leaps 7.7->6.9)
  //   -> ~70ms later AVPlayer freezes ~1.2s, then resumes from the SAME position.
  //   No tap involved (buttons unselected all through the stall). Source clip has
  //   continuous motion (content-still ruled out). That signature = iOS audio-
  //   session/rate transition triggered by play() at reveal: session work blocks
  //   the main thread, then interrupts the player itself. Explains why sim never
  //   reproduces (Mac audio stack) and why B74/76/77/78/79/82/83 all failed —
  //   every build kept a play()/rate change at reveal. B79's mute didn't help
  //   because a muted AVPlayer with an audio track still does session work.
  // B84 FIX: the player NEVER stops. It plays silently (volume 0) under the
  //   opaque countdown from the moment the file is ready — decoder AND audio
  //   session fully hot. At reveal: seek to 0 + volume 1. A seek on a playing
  //   player is no rate transition -> no session event -> nothing to block on.
  //   B81 CONTRACT preserved: clip starts AT "GO" from 0:00 (the seek), silent
  //   until reveal so nothing leaks the animal.
  // B90: player creation moved to ReskinApp (shared across screens). This screen still
  // owns the LOAD (replaceAsync) + the B87 cure + the watchdog, since it mounts first.
  const [vidReady, setVidReady] = useState(false);
  const concealedRef = useRef(concealed); concealedRef.current = concealed;
  useEffect(() => {
    if (!videoUri || !player) return;
    let alive = true;
    (async () => {
      try {
        await player.replaceAsync(videoUri);
        if (!alive) return;
        setVidReady(true);
        // B84: play silent and NEVER pause. The B81 park-at-zero let the AV
        // pipeline go cold, so the at-reveal play() re-triggered the session
        // work that blocks the main thread. Cover is opaque — nothing shows.
        player.volume = 0;
        player.play();
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, [videoUri, player]);
  useEffect(() => {
    try {
      if (!videoUri || !player || !vidReady) return;
      // B87 CURE (2026-08-22): the freeze was the clips' AUDIO TRACK. iOS runs
      // audio-session work for any playing AVPlayer that has an audio track even
      // at volume 0 (why B79's mute failed); that work blocked the main thread at
      // reveal+330ms and then knocked the player over. All 20 server clips are now
      // re-muxed video-only (sense-server e58b09ce) — B86b verified CLEAN on CJ's
      // device. player.volume stays 0 forever as belt-and-suspenders: if a future
      // clip ships with an audio track by mistake, it must not leak the answer.
      // NEW-CLIP RULE: every clip pushed to sense-server MUST be `-c:v copy -an`.
      player.volume = 0;
      if (!concealed) {
        player.currentTime = 0; // start-at-GO contract (CJ product decision): clip runs from 0:00 exactly at reveal
      }
    } catch (e) {}
  }, [videoUri, vidReady, concealed]);
  useEffect(() => { // B72 watchdog, re-enabled in B87 — it was the only thing that ever revived a knocked-over player (B86 proved nothing else recovers it)
    if (!videoUri || !player || !vidReady || concealed) return;
    let last = -1, stuck = 0;
    const iv = setInterval(() => {
      try {
        const t = player.currentTime || 0;
        if (!player.playing) player.play();
        if (t === last) { stuck++; if (stuck >= 3) { player.replay(); stuck = -2; } } else { stuck = 0; } // B74: 3s + grace — don't restart a clip that's merely janked
        last = t;
      } catch (e) {}
    }, 1000);
    return () => clearInterval(iv);
  }, [videoUri, vidReady, concealed]);
  const [locked, setLocked] = useState(null);
  const raf = useRef(null);

  useEffect(() => {
    if (secondsLeft != null) return;        // frozen mode
    const localStart = Date.now();          // fallback only (previews without a game clock)
    let last = ROUND_S + 0.001;
    const tick = () => {
      // read the scoring t0 PER TICK (App.js sets startRef in an effect that
      // runs after this child effect — raf fires after all effects, so the
      // first frame already sees the fresh value)
      const t0 = startTsRef && startTsRef.current ? startTsRef.current : localStart;
      const left = Math.max(0, Math.min(ROUND_S, ROUND_S - (Date.now() - t0) / 1000));
      // 30Hz setState cap: the ring sweeps 36 deg/s, so 33ms steps are
      // sub-pixel; halves the JS/SVG re-render cost of the live screen
      if (left === 0 || last - left >= 1 / 30) { last = left; setT(left); } // B88: 30Hz + hundredths readout — stopwatch spin (CJ: faster FEEL, same 8s). Render pressure proven innocent (freeze was the clips' audio track, cured B86b).
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

      {/* B97: the still renders ONLY when there is no clip — the video's first frame
          is the poster now (rounds gate on the download, so videoUri is set at mount;
          the photo is the download-failure / no-video fallback, not an underlay) */}
      {(videoUri || videoExpected) ? null : (
        <CoverPhoto source={photo} naturalW={photoW} naturalH={photoH} boxW={width} boxH={height}
          style={{ position: 'absolute', top: 0, left: 0, opacity: concealed ? 0 : 1 }} />
      )}

      {/* 1.4.0: looping clip over the still (photo stays underneath as the instant poster) */}
      {videoUri && vidReady ? (
        // B83: opacity ALWAYS 1. The old `concealed ? 0 : 1` flip meant iOS wired the
        // video layer into the render pipeline AT reveal — main-thread work landing
        // ~300ms in = the deterministic 7.7 stick, and it knocked AVPlayer over
        // (video stayed frozen until something called replay). The opaque countdown
        // overlay (zIndex 80) covers this view until exactly 2400ms, so nothing
        // leaks: the layer is composited + playing from round start, and at reveal
        // the video layer changes NOTHING.
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height, opacity: 1 }}>
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

      <GlassHeader streak={streak} balance={balance} showClock={showClock} {...(avatar ? { avatar } : {})} />
      <StakePill text={stake} />
      {/* frozen (answered) readout shows hundredths so it equals the scored
          time exactly; live readout stays tenths */}
      <TimerRing secondsLeft={tLeft} mode={ringMode} precision={2} />
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
  const ringElapsed = ROUND_S - tLeft;
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
