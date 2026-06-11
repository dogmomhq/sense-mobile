// ── RESULTS (1:1 port of anim_gallery/results_demo.html, locked spec) ───────
// Timeline: reveal (your card slides in -> rival '???' shimmer -> flip at
// 1500ms) -> race (count-up bars w/ rumble, finish line fades in over the
// last 300ms, smash + screen kick at the lock; |gap| < 0.25s -> 0.3x time
// dilation + EKG heartbeat, verdict colors HELD until the lock — no outcome
// tells) -> explode per outcome:
//   WIN      flash + triple shockwave + 12-ray burst + 120 pooled confetti
//            (bills/coins simplified to confetti variants for perf) + payout
//            hero slam -> flies into the balance pill -> odometer roll
//   LOSS     photo-only desaturation (chrome stays full color), YOU LOST
//            heavy drop + thud, rival-time anchor in lime + BEAT THAT pulse,
//            your bar crumbles into 9 falling fragments
//   NEARMISS gap monument swells red, beats twice, collapses into the
//            PLAY AGAIN button which ignites
//   DRAW     lime vertical split, mirrored avatars + identical times, DRAW
//            stamp, STAKE RETURNED pill (per ui_mockups_v2/batch6/draw.png)
// Pure presentational: deterministic function of props + clock. One master
// Animated clock (ms); all motion is interpolate() on transforms/opacity;
// digits/odometer are tiny subscribed leaf Texts. `freezeAt` renders a
// deterministic still for screenshots.
// DECISIONS 2026-06-11: RUN IT BACK renamed PLAY AGAIN (same-tier re-queue,
// open pool); speed-pill thresholds from live code (<0.6s INSANE, <1.0s
// LIGHTNING, <1.6s FAST, win-only); escrow display rule -> balanceBefore is
// the post-stake balance, payout/refund rolls on top of it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, Animated, Easing, useWindowDimensions, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import GlassHeader from './components/GlassHeader';
import CoverPhoto from './components/CoverPhoto';
import ConfettiBurst from './components/ConfettiBurst';
import { COLORS, FONTS, useScale, BASE_W, BASE_H } from './theme';

const DEMO_PHOTO = require('../assets/cheetah.jpeg');
const AVATAR = require('../assets/avatar_demo.png');
const RED = '#FF5A48';

/* ── easings / helpers (verbatim from the HTML spec) ── */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inCubic = (p) => p * p * p;
const backOut = (p, k = 1.7) => { p -= 1; return p * p * ((k + 1) * p + k) + 1; };
const win01 = (t, start, dur) => clamp01((t - start) / dur);
const spike = (t, start, up, down) =>
  t < start ? 0 : t < start + up ? (t - start) / up : clamp01(1 - (t - start - up) / down);
function hrand(k, salt, seed = 7) {
  let x = (seed ^ Math.imul(k + 1, 2654435761) ^ Math.imul(salt + 1, 1597334677)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519); x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ── speed pill: LIVE thresholds (RESULTS_CONTENT §C5 / gap analysis #11) ── */
export function speedLabel(ms) {
  if (ms < 600) return '🔥 INSANE';
  if (ms < 1000) return '⚡ LIGHTNING';
  if (ms < 1600) return 'FAST';
  return null;
}

/* ── timeline skeleton: identical math to the HTML spec ── */
export function buildTimeline(youT, oppT) {
  const maxT = Math.max(youT, oppT), winT = Math.min(youT, oppT);
  const CLOSE = Math.abs(youT - oppT) < 0.25;        // gap-driven, NOT outcome-driven
  const REVEAL_OPP = 800, FLIP = 1500, RACE_START = 2400;
  const RACE_FULL = 1800, msPerS = RACE_FULL / maxT;
  const SEGS = [];
  let t0 = RACE_START, s0 = 0;
  const add = (ds, dur, type) => { SEGS.push({ t0, dur, s0, ds, type }); t0 += dur; s0 += ds; };
  if (CLOSE) {
    const sD = winT * 0.85;
    add(sD, sD * msPerS, 'lin');
    const rampDur = 280, rampDs = (0.65 * rampDur) / msPerS;
    add(rampDs, rampDur, 'ramp');
    const ds3 = maxT - (sD + rampDs);
    add(ds3, (ds3 * msPerS) / 0.3, 'lin');           // the agonizing 0.3x crawl
  } else {
    const sH = maxT * 0.93;
    add(sH, sH * msPerS, 'lin');
    add(maxT * 0.004, 200, 'lin');                   // breath-hold hitch
    add(maxT - (sH + maxT * 0.004), 110, 'lin');     // snap to the lock
  }
  const LAST = SEGS[SEGS.length - 1];
  const RACE_END = LAST.t0 + LAST.dur;
  const DIL_START = CLOSE ? SEGS[1].t0 : 0, DIL_DUR = CLOSE ? RACE_END - DIL_START : 1;
  const EXPLODE = RACE_END + 700;
  const CYCLE = EXPLODE + 5600;
  const HIT = 520, HOLD = 90, HOLD_GAIN = HOLD * (1 - 0.08);
  const T_GAP = CLOSE ? RACE_END : RACE_START + winT * msPerS;
  const raceState = (t) => {
    if (t <= RACE_START) return { s: 0, rate: 1 };
    if (t >= RACE_END) return { s: maxT, rate: 0 };
    for (const g of SEGS) {
      if (t < g.t0 + g.dur) {
        const u = (t - g.t0) / g.dur;
        if (g.type === 'ramp') return { s: g.s0 + (g.ds * (u - 0.35 * u * u)) / 0.65, rate: 1 - 0.7 * u };
        return { s: g.s0 + g.ds * u, rate: (g.ds / g.dur) * msPerS };
      }
    }
    return { s: maxT, rate: 0 };
  };
  return { maxT, winT, CLOSE, REVEAL_OPP, FLIP, RACE_START, RACE_END, DIL_START, DIL_DUR,
    EXPLODE, CYCLE, HIT, HOLD_GAIN, T_GAP, raceState };
}

/* warped-explode-time inverse: event scheduled at warped ew fires at real e */
const invWarp = (ew, HIT, HOLD_GAIN, isWin) => (!isWin || ew <= HIT) ? ew : ew + HOLD_GAIN;

/* keyframe sampler -> Animated interpolation */
function kf(clock, t0, t1, fn, steps = 10, pre = null) {
  const inR = [], outR = [];
  if (pre != null && t0 > 0) { inR.push(0, t0); outR.push(pre, fn(0)); }
  for (let i = pre != null ? 1 : 0; i <= steps; i++) {
    inR.push(t0 + ((t1 - t0) * i) / steps); outR.push(fn(i / steps));
  }
  return clock.interpolate({ inputRange: inR, outputRange: outR, extrapolate: 'clamp' });
}
const seg = (clock, t0, dur, o0 = 0, o1 = 1) =>
  clock.interpolate({ inputRange: [t0, t0 + dur], outputRange: [o0, o1], extrapolate: 'clamp' });
const spikeI = (clock, t0, up, down, peak = 1) =>
  clock.interpolate({ inputRange: [t0, t0 + up, t0 + up + down],
    outputRange: [0, peak, 0], extrapolate: 'clamp' });

/* ── tiny subscribed leafs: the ONLY per-frame React state in the screen ── */
function useT(subscribe, freezeAt) {
  const [t, setT] = useState(freezeAt != null ? freezeAt : 0);
  useEffect(() => {
    if (freezeAt != null) { setT(freezeAt); return; }
    return subscribe(setT);
  }, [subscribe, freezeAt]);
  return t;
}

// race count-up digit; verdict color HELD until the slower bar locks (CLOSE)
function RaceNum({ subscribe, freezeAt, TL, lock, wins, style }) {
  const t = useT(subscribe, freezeAt);
  const v = t < TL.RACE_START ? 0 : Math.min(lock, TL.raceState(t).s);
  const locked = v >= lock - 1e-9;
  const verdict = !TL.CLOSE || t >= TL.RACE_END;
  const color = locked && verdict ? (wins ? COLORS.lime : 'rgba(245,241,230,0.45)') : COLORS.cream;
  return <Text style={[style, { color }]}>{v.toFixed(2)}s</Text>;
}

// balance odometer: rolls from `from` to `from+delta` over [t0, t0+dur]
function BalanceOdometer({ subscribe, freezeAt, from, delta, t0, dur, style }) {
  const t = useT(subscribe, freezeAt);
  const v = from + delta * outCubic(win01(t, t0, dur));
  return <Text style={style}>${v.toFixed(2)}</Text>;
}

// rival answer flip: '???' shimmer pulse -> rotateX flip to the answer at FLIP
function OppFlip({ subscribe, freezeAt, TL, answer, s }) {
  const t = useT(subscribe, freezeAt);
  let rot = 0, showA = false;
  if (t >= TL.FLIP) {
    const f1 = win01(t, TL.FLIP, 150), f2 = win01(t, TL.FLIP + 150, 250);
    if (f2 === 0) rot = f1 * 90; else { showA = true; rot = -90 + backOut(f2) * 90; }
  }
  const shimmer = !showA && t >= TL.REVEAL_OPP ? 0.55 + 0.45 * Math.abs(Math.sin(t / 220)) : 1;
  return (
    <View style={{ transform: [{ perspective: 900 * s }, { rotateX: rot + 'deg' }] }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, lineHeight: 100 * s,
        letterSpacing: 0.02 * 96 * s, color: showA ? COLORS.cream : 'rgba(214,210,190,' + shimmer + ')' }}>
        {showA ? answer : '???'}
      </Text>
    </View>
  );
}

// EKG heartbeat line — draws on with the time dilation (CLOSE races only)
const EKG_D = 'M0 70 H280 L310 22 L345 116 L375 70 H540 L570 26 L605 112 L635 70 H880';
const EKG_LEN = 1320; // measured path length of EKG_D
function EkgLine({ subscribe, freezeAt, TL, s }) {
  const t = useT(subscribe, freezeAt);
  const dil = win01(t, TL.DIL_START, TL.DIL_DUR);
  const op = win01(t, TL.DIL_START, 300) * (1 - win01(t, TL.EXPLODE, 250));
  if (op <= 0) return null;
  const b1 = spike(dil, 0.30, 0.07, 0.18), b2 = spike(dil, 0.62, 0.07, 0.18);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 72 * s, top: 1884 * s,
      width: 880 * s, height: 130 * s, opacity: op, zIndex: 16 }}>
      <Svg width={880 * s} height={130 * s} viewBox="0 0 880 130">
        <Path d={EKG_D} stroke={COLORS.lime} strokeWidth={6} fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={[EKG_LEN, EKG_LEN]} strokeDashoffset={EKG_LEN * (1 - dil)} />
      </Svg>
      {[{ x: 327, y: 22, o: b1 }, { x: 587, y: 26, o: b2 }].map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: (p.x - 45) * s, top: (p.y - 45) * s,
          width: 90 * s, height: 90 * s, borderRadius: 45 * s, opacity: p.o,
          backgroundColor: 'rgba(215,248,74,0.55)' }} />
      ))}
    </View>
  );
}

// loss crumble: 9 fragments of your bar fall with gravity (subscribed leaf —
// quadratic fall is cheaper exact in JS than keyframed for 9 views)
function CrumbleFrags({ subscribe, freezeAt, TL, s, youFrac }) {
  const t = useT(subscribe, freezeAt);
  const frags = useMemo(() => {
    const rnd = mulberry32(7 * 97 + 1), arr = [];
    for (let i = 0; i < 9; i++) arr.push({
      vx: (rnd() - 0.5) * 260, vy: -60 - rnd() * 160,
      rot: (rnd() - 0.5) * 520, delay: i * 28 + rnd() * 40 });
    return arr;
  }, []);
  const e = t - TL.EXPLODE;
  if (e < 0) return null;
  const bw = (880 * youFrac) / 9;
  return (
    <>
      {frags.map((fr, i) => {
        const ft = (e - 320 - fr.delay) / 1000;
        if (ft <= 0 || ft > 1.3) return null;
        return (
          <View key={i} pointerEvents="none" style={{
            position: 'absolute', width: (bw - 4) * s, height: 24 * s, borderRadius: 5 * s,
            backgroundColor: 'rgba(175,185,155,0.85)', zIndex: 16,
            opacity: Math.min(1, (1.3 - ft) / 0.4),
            left: (72 + i * bw + fr.vx * ft) * s,
            top: (1424 + fr.vy * ft + 1600 * ft * ft) * s,
            transform: [{ rotate: fr.rot * ft + 'deg' }] }} />
        );
      })}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function ResultsScreen({
  outcome = null,                       // optional override: win|loss|nearmiss|closewin|draw
  you = { answer: 'CHEETAH', time: 1.42, correct: true },
  opp = { answer: 'CHEETAH', time: 1.76, correct: true },
  correctAnswer = 'CHEETAH',
  stake = 1.0, payout = 1.9,
  balanceBefore = 24.5,                 // post-stake balance (escrow display rule)
  streak = 8, record = { w: 12, d: 1, l: 4 },
  photo = DEMO_PHOTO, photoW = 768, photoH = 1376,
  freezeAt = null,                      // 'reveal'|'race'|'explode'|'burst'|'payout' or ms
  onPlayAgain, onHome, onCycleEnd, showClock = false,
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();

  /* outcome derivation (deterministic from props; override for previews) */
  let kind = outcome;
  if (!kind) {
    if (you.correct && !opp.correct) kind = 'win';
    else if (!you.correct && opp.correct) kind = 'loss';
    else if (you.time === opp.time || (!you.correct && !opp.correct)) kind = 'draw';
    else kind = you.time < opp.time ? 'win' : 'loss';
  }
  const gapS = Math.abs(you.time - opp.time);
  const isDraw = kind === 'draw';
  const isWin = kind === 'win' || kind === 'closewin';
  const isMiss = kind === 'nearmiss' || (kind === 'loss' && you.correct && opp.correct && gapS > 0 && gapS <= 0.25);
  const isLoss = kind === 'loss' && !isMiss;
  const youWins = isWin;

  const TL = useMemo(() => buildTimeline(you.time, opp.time), [you.time, opp.time]);
  const HG = TL.HOLD_GAIN, HIT = TL.HIT, E = TL.EXPLODE;
  const inv = (ew) => invWarp(ew, HIT, HG, isWin);    // warped explode ms -> real ms
  const HERO = inv(760);                              // payout hero slam (real ms after E)

  const FREEZE_MAP = {
    reveal: 1150,
    race: TL.CLOSE ? TL.DIL_START + 480 : TL.RACE_START + 1300,
    explode: E + (isWin ? 440 : isMiss ? 900 : 700),
    burst: E + 700 + HG,
    payout: E + 1350 + HG,
  };
  const FT = freezeAt == null ? null : (typeof freezeAt === 'number' ? freezeAt : FREEZE_MAP[freezeAt] ?? null);

  /* master clock + JS rumble channel */
  const clock = useRef(new Animated.Value(FT != null ? FT : 0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  const shakeR = useRef(new Animated.Value(0)).current;
  const punch = useRef(new Animated.Value(1)).current;
  const subs = useRef(new Set());
  const subscribe = useMemo(() => (fn) => { subs.current.add(fn); return () => subs.current.delete(fn); }, []);

  const renderShake = (t) => {
    let sx = 0, sy = 0, sr = 0, sc = 1;
    const rs = TL.raceState(t), p = rs.s / TL.maxT;
    if (t >= TL.RACE_START && t < TL.RACE_END) {       // THE RUMBLE (softens w/ dilation)
      const soft = 0.3 + 0.7 * Math.min(1, rs.rate);
      const inten = (1.5 + Math.pow(p, 1.5) * 10.5) * soft, k = Math.floor(t / 25);
      sx = (hrand(k, 1) * 2 - 1) * inten;
      sy = sx * 0.4 + (hrand(k, 2) * 2 - 1) * inten * 0.3;
      sr = (hrand(k, 3) * 2 - 1) * inten * 0.08;
    }
    sx += 6 * spike(t, TL.RACE_END, 40, 170) * (hrand(Math.floor(t / 20), 9) > 0.5 ? 1 : -1);
    sy += 4 * spike(t, TL.RACE_END, 40, 170);
    if (TL.CLOSE && t < E) {                            // heartbeat thumps
      const dil = win01(t, TL.DIL_START, TL.DIL_DUR);
      sc += 0.01 * (spike(dil, 0.30, 0.07, 0.18) + spike(dil, 0.62, 0.07, 0.18));
    }
    const e = t - E;
    if (e >= 0) {
      if (isWin) {
        sy += 10 * spike(e, HIT, 40, 170); sx += 6 * spike(e, HIT, 40, 170);
        sc += 0.06 * spike(e, 320, 100, 150) + 0.05 * spike(e, HERO + 240, 70, 170);
        sy += 8 * spike(e, HERO + 240, 40, 160);
      }
      if (isLoss) sy += 12 * spike(e, 680, 50, 160);    // YOU LOST landing thud
      if (isMiss) sc += 0.012 * (spike(e, 650, 90, 220) + spike(e, 1100, 90, 220));
      if (isDraw) { sy += 10 * spike(e, 650 + 220, 40, 170); }  // stamp thud
    }
    shakeX.setValue(sx * s); shakeY.setValue(sy * s); shakeR.setValue(sr); punch.setValue(sc);
  };

  useEffect(() => {
    if (FT != null) { clock.setValue(FT); renderShake(FT); subs.current.forEach((f) => f(FT)); return; }
    let raf, start = null, done = false;
    const loop = (now) => {
      if (start == null) start = now;
      const t = Math.min(now - start, TL.CYCLE);
      clock.setValue(t); renderShake(t); subs.current.forEach((f) => f(t));
      if (t >= TL.CYCLE) { if (!done) { done = true; if (onCycleEnd) onCycleEnd(); } return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [TL, FT]);

  /* ── shared interpolations ── */
  // explode fade of the race/reveal furniture (win fades during the +700 hold)
  const fadeOld = isWin
    ? seg(clock, TL.RACE_END + 250, 350, 1, 0)
    : seg(clock, E, 250, 1, 0);
  const youIn = kf(clock, 0, 450, (q) => outCubic(q));
  const oppIn = kf(clock, TL.REVEAL_OPP, 500, (q) => outCubic(q), 8, 0);
  const raceIn = seg(clock, TL.RACE_START - 200, 300);

  // race fills: scaleX sampled through the time warp (dilation curve baked in)
  const fillFrac = (lock) => kf(clock, TL.RACE_START, TL.RACE_END,
    (q) => Math.min(lock, TL.raceState(TL.RACE_START + q * (TL.RACE_END - TL.RACE_START)).s) / TL.maxT, 36, 0);
  const youFracI = fillFrac(you.time), oppFracI = fillFrac(opp.time);
  const TRACK_W = 880 * s;
  const barT = (frac) => [
    { translateX: frac.interpolate({ inputRange: [0, 1], outputRange: [-TRACK_W / 2, 0] }) },
    { scaleX: frac.interpolate({ inputRange: [0, 1], outputRange: [0.0001, 1] }) },
  ];

  // gap stamp
  const gapIn = kf(clock, TL.T_GAP, TL.CLOSE ? 180 : 220, (q) => q, 6, 0);
  const gapScale = kf(clock, TL.T_GAP, TL.CLOSE ? 180 : 220,
    (q) => (TL.CLOSE ? 2.2 : 1.7) - (TL.CLOSE ? 1.2 : 0.7) * backOut(q), 8, TL.CLOSE ? 2.2 : 1.7);

  // finish line: in over the last 300ms, dies after the smash
  const finOp = Animated.multiply(
    seg(clock, TL.RACE_END - 300, 300),
    seg(clock, TL.RACE_END + 120, 200, 1, 0));
  const finScaleY = seg(clock, TL.RACE_END + 120, 220, 1, 0.1);
  const finShockP = kf(clock, TL.RACE_END, 500, (q) => 0.15 + outCubic(q) * 3.2, 8, 0.15);
  const finShockO = kf(clock, TL.RACE_END, 500, (q) => 0.9 * (1 - q), 4, 0);

  // dilation tag
  const tagOp = TL.CLOSE ? Animated.multiply(
    seg(clock, TL.DIL_START, 220), seg(clock, TL.RACE_END, 200, 1, 0)) : new Animated.Value(0);

  /* ── explode interpolations ── */
  const eyebrowIn = kf(clock, E + inv(180), 300, (q) => q, 4, 0);
  const eyebrowY = kf(clock, E + inv(180), 300, (q) => 24 * (1 - outCubic(q)) * s, 8, 24 * s);

  // headline: loss = heavy drop; win/miss = slam scale 2.6 -> 1 (impact at HIT)
  const hlOp = isLoss ? seg(clock, E + 320, 10) : kf(clock, E + 180, 60, (q) => q, 3, 0);
  const hlY = isLoss
    ? kf(clock, E + 320, 360, (q) => -360 * (1 - inCubic(q)) * s, 12, -360 * s)
    : (isWin ? kf(clock, E + HERO, 280, (q) => -60 * outCubic(q) * s, 8, 0) : new Animated.Value(0));
  const hlScale = isLoss ? new Animated.Value(1)
    : kf(clock, E + 180, HIT - 180, (q) => 2.6 - 1.6 * backOut(q), 12, 2.6);

  // flashes
  const mkFlash = (frames) => clock.interpolate({
    inputRange: frames.map((f) => f[0]), outputRange: frames.map((f) => f[1]), extrapolate: 'clamp' });
  const flashWhite = isWin ? mkFlash([[E + HIT + 40, 0], [E + HIT + 80, 0.62], [E + HIT + 260, 0]]) : new Animated.Value(0);
  const flashLime = isWin ? mkFlash([
    [E + HIT, 0], [E + HIT + 50, 0.38], [E + HIT + 145, 0.05],
    [E + HIT + 150, 0.05], [E + HIT + 210, 0.16], [E + HIT + 370, 0],
    [E + HERO + 240, 0], [E + HERO + 290, 0.3], [E + HERO + 470, 0]]) : new Animated.Value(0);
  const flashRed = (isLoss || isMiss || isDraw) && !isWin
    ? mkFlash([[E, 0], [E + 60, isDraw ? 0.2 : 0.45], [E + 380, 0]]) : new Animated.Value(0);

  // shockwave rings (win: triple from the slam; loss/miss: single red)
  const ringStarts = isWin ? [E + HIT, E + HIT + 100, E + HIT + 200] : [E, E + 150];
  const rings = ringStarts.map((t0, i) => ({
    scale: kf(clock, t0, 900, (q) => 0.1 + outCubic(q) * (4.9 + i * 0.25), 10, 0.1),
    op: kf(clock, t0, 900, (q) => (0.85 - i * 0.12) * (1 - q), 6, 0),
    color: isWin ? [COLORS.lime, COLORS.cream, '#FFFFFF'][i] : RED,
  })).filter((_, i) => isWin || i === 0);

  // 12-ray radial burst (win)
  const rayP = kf(clock, E + HIT, 250, (q) => q, 8, 0);
  const rayOp = kf(clock, E + HIT, 250, (q) => (q > 0 ? 0.9 * (1 - q) : 0), 6, 0);

  // payout hero: slam in -> hold -> fly to the balance pill
  const BAL_CX = 797.5, BAL_CY = 178;                 // balance pill center (proto px)
  const heroIn = kf(clock, E + HERO, 280, (q) => 2.4 - 1.4 * backOut(q), 10, 2.4);
  const smooth = (q) => q * q * (3 - 2 * q);
  const heroX = kf(clock, E + HERO + 890, 450, (q) => (BAL_CX - 512) * smooth(q) * s, 12, 0);
  const heroY = kf(clock, E + HERO + 890, 450, (q) => (BAL_CY - 851) * smooth(q) * s, 12, 0);
  const heroScale = Animated.multiply(heroIn,
    kf(clock, E + HERO + 890, 450, (q) => Math.max(0.13, 1 - 0.84 * smooth(q)), 12, 1));
  const heroOp = mkFlash([[E + HERO, 0], [E + HERO + 95, 1], [E + HERO + 1290, 1], [E + HERO + 1360, 0]]);
  const heroShockP = kf(clock, E + HERO + 240, 600, (q) => 0.12 + outCubic(q) * 3.6, 10, 0.12);
  const heroShockO = kf(clock, E + HERO + 240, 600, (q) => 0.8 * (1 - q), 6, 0);
  const balPop = kf(clock, E + HERO + 1330, 370, (q) => 1 + 0.09 * spike(q * 370, 0, 110, 260), 10, 1);

  // speed pill (win only, live thresholds)
  const pillLabel = speedLabel(you.time * 1000);
  const pillIn = kf(clock, E + HERO + 1440, 260, (q) => q, 6, 0);
  const pillScale = kf(clock, E + HERO + 1440, 260, (q) => 2.2 - 1.2 * backOut(q), 8, 2.2);

  // loss: anchor line + BEAT THAT pulse + bar crumble
  const anchorIn = kf(clock, E + 580, 400, (q) => q, 6, 0);
  const anchorY = kf(clock, E + 580, 400, (q) => 30 * (1 - outCubic(q)) * s, 8, 30 * s);
  const beatPulse = kf(clock, E + 1300, 4000, (q) => 1 + 0.05 * Math.sin((q * 4000) / 170), 56, 1);
  const youFillOp = isLoss ? mkFlash([[E + 280, 1], [E + 530, 0]]) : new Animated.Value(1);
  const desatOp = (isLoss || isMiss) ? seg(clock, E, 600, 0, isLoss ? 0.55 : 0.3) : new Animated.Value(0);

  // vignette (red): loss/miss pulses + CLOSE heartbeat pre-lock
  const vigFrames = [];
  if (TL.CLOSE) {
    const b = (c) => TL.DIL_START + c * TL.DIL_DUR;
    vigFrames.push([b(0.28), 0], [b(0.335), 0.3], [b(0.48), 0], [b(0.60), 0], [b(0.655), 0.3], [b(0.80), 0]);
  }
  if (isLoss || isMiss) vigFrames.push(
    [E, 0], [E + 120, 0.6], [E + 500, 0], [E + 560, 0.02], [E + 680, 0.5],
    [E + 1058, 0.02], [E + 1550, 0.22], [TL.CYCLE, 0.22]);
  const vigOp = vigFrames.length ? mkFlash(vigFrames) : new Animated.Value(0);

  // nearmiss: gap monument -> two beats -> collapses into PLAY AGAIN
  const BTN_CY = 1848 + 76;
  const monT0 = E + 250, monT1 = E + 1900;
  const monFn = (q) => {
    const e = 250 + q * 1650;
    const inP = backOut(win01(e, 250, 260));
    const beat = 0.09 * (spike(e, 650, 90, 220) + spike(e, 1100, 90, 220));
    const col = inCubic(win01(e, 1500, 320));
    return { sc: (0.25 + 0.75 * inP) * (1 + beat) * (1 - 0.78 * col), dy: (BTN_CY - 875) * col };
  };
  const monScale = kf(clock, monT0, 1650, (q) => Math.max(0.05, monFn(q).sc), 44, 0.25);
  const monY = kf(clock, monT0, 1650, (q) => monFn(q).dy * s, 24, 0);
  const monOp = mkFlash([[monT0, 0], [monT0 + 200, 1], [E + 1815, 1], [E + 1825, 0]]);
  const monLblOp = mkFlash([[monT0, 0], [monT0 + 260, 1], [E + 1500, 1], [E + 1660, 0]]);
  const igniteGlow = isMiss ? kf(clock, E + 1820, 720, (q) => spike(q * 720, 0, 120, 600), 12, 0) : new Animated.Value(0);
  const shimmerX = kf(clock, E + 1820, 650, (q) => (-400 + 1750 * q) * s, 8, -400 * s);

  // draw furniture
  const splitIn = kf(clock, E + 100, 350, (q) => outCubic(q), 8, 0);
  const avInL = kf(clock, E + 250, 320, (q) => backOut(q), 10, 0);
  const avInR = kf(clock, E + 400, 320, (q) => backOut(q), 10, 0);
  const stampScale = kf(clock, E + 650, 220, (q) => 3 - 2 * backOut(q), 10, 3);
  const stampOp = kf(clock, E + 650, 90, (q) => q, 3, 0);
  const refundIn = kf(clock, E + 1100, 300, (q) => q, 6, 0);

  // result card / stats / mode line / buttons
  const cdT0 = E + inv(isLoss ? 1080 : isWin ? 820 : 580);
  const cardIn = kf(clock, cdT0, 400, (q) => q, 6, 0);
  const cardY = kf(clock, cdT0, 400, (q) => 60 * (1 - outCubic(q)) * s, 8, 60 * s);
  const btT0 = E + inv(isLoss ? 1400 : isWin ? 1280 : isDraw ? 1300 : 980);
  const btnIn = kf(clock, btT0, 300, (q) => q, 6, 0);
  const btnY = kf(clock, btT0, 300, (q) => 40 * (1 - outCubic(q)) * s, 8, 40 * s);
  const idleT0 = E + 1400, idleSpan = Math.max(600, TL.CYCLE - idleT0);
  const idlePulse = kf(clock, idleT0, idleSpan, (q) => 1 + 0.013 * Math.sin((q * idleSpan) / 260), 64, 1);
  const btnScale = isMiss ? Animated.multiply(idlePulse,
    kf(clock, E + 1820, 720, (q) => 1 + 0.06 * spike(q * 720, 0, 120, 600), 12, 1)) : idlePulse;

  /* strings */
  const fmt = (n) => '$' + n.toFixed(2);
  const eyebrowTxt = isDraw ? 'DEAD HEAT'
    : isWin ? (TL.CLOSE ? 'PHOTO FINISH' : 'TOO FAST')
    : isMiss ? 'PHOTO FINISH' : 'NEXT TIME';
  const headlineTxt = isWin ? 'YOU WIN' : isMiss ? 'SO CLOSE' : 'YOU LOST';
  const gapTxt = (youWins ? '+' : '+') + gapS.toFixed(2) + 's';
  const statsTxt = `${record.w}W · ${record.d}D · ${record.l}L`;
  const balDelta = isWin ? payout : isDraw ? stake : 0;
  const balT0 = isWin ? E + HERO + 1380 : E + 1200;
  const mark = (c) => (c ? ' ✓' : ' ✗');

  /* ── shared text styles ── */
  const lblSt = { fontFamily: FONTS.interExtra, fontSize: 27 * s, letterSpacing: 0.28 * 27 * s, color: COLORS.creamDim, marginBottom: 18 * s };
  const monoChip = { fontFamily: FONTS.mono, fontSize: 46 * s, color: COLORS.lime };
  const cardBox = { position: 'absolute', left: 60 * s, right: 60 * s, backgroundColor: 'rgba(16,20,13,0.84)',
    borderWidth: 2.5 * s, borderColor: 'rgba(215,248,74,0.55)', borderRadius: 28 * s,
    paddingTop: 46 * s, paddingHorizontal: 52 * s, paddingBottom: 42 * s, zIndex: 15 };

  const Ring = ({ p, o, color, size = 340, cx = 512, cy = 840, bw = 10 }) => (
    <Animated.View pointerEvents="none" style={{ position: 'absolute',
      left: (cx - size / 2) * s, top: (cy - size / 2) * s, width: size * s, height: size * s,
      borderRadius: (size / 2) * s, borderWidth: bw * s, borderColor: color,
      opacity: o, zIndex: 48, transform: [{ scale: p }] }} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest, overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={{ flex: 1, transform: [
        { translateX: shakeX }, { translateY: shakeY },
        { rotate: shakeR.interpolate({ inputRange: [-1, 1], outputRange: ['-1deg', '1deg'] }) },
        { scale: punch }] }}>

        {/* photo + (loss/miss) photo-only desat — chrome stays full color */}
        <CoverPhoto source={photo} naturalW={photoW} naturalH={photoH} boxW={width} boxH={height}
          style={{ position: 'absolute', top: 0, left: 0, opacity: 0.9 }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#6E726A', opacity: desatOp, zIndex: 1 }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(11,15,10,0.80)', zIndex: 1 }} />
        <LinearGradient pointerEvents="none"
          colors={['rgba(30,34,26,0.93)', 'rgba(30,34,26,0.91)', 'rgba(30,34,26,0.55)', 'rgba(30,34,26,0.25)', 'rgba(30,34,26,0)']}
          locations={[0, 0.5, 0.64, 0.78, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.2, zIndex: 2 }} />
        <LinearGradient pointerEvents="none"
          colors={['rgba(11,15,10,0)', 'rgba(11,15,10,0.78)', 'rgba(11,15,10,0.97)']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.42, zIndex: 2 }} />

        {/* red vignette */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: vigOp, zIndex: 17 }}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="vig" cx="50%" cy="50%" rx="72%" ry="62%">
                <Stop offset="48%" stopColor="rgba(239,68,68,0)" stopOpacity="0" />
                <Stop offset="100%" stopColor="rgb(190,30,20)" stopOpacity="0.7" />
              </RadialGradient>
            </Defs>
            <Ellipse cx="50%" cy="50%" rx="78%" ry="68%" fill="url(#vig)" />
          </Svg>
        </Animated.View>

        {/* header (live balance odometer nested into the pill) */}
        <GlassHeader streak={streak} showClock={showClock}
          balance={<BalanceOdometer subscribe={subscribe} freezeAt={FT}
            from={balanceBefore} delta={balDelta} t0={balT0} dur={620}
            style={{ fontFamily: FONTS.interBlack, fontSize: 48 * s, letterSpacing: -0.02 * 48 * s, color: COLORS.cream }} />} />
        {/* balance absorb glow */}
        {isWin ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 121 * s, right: 55 * s,
            width: 343 * s, height: 114 * s, borderRadius: 22 * s, borderWidth: 3 * s,
            borderColor: COLORS.lime, zIndex: 25,
            opacity: kf(clock, E + HERO + 1330, 370, (q) => spike(q * 370, 0, 110, 260) * 0.8, 10, 0),
            transform: [{ scale: balPop }] }} />
        ) : null}

        {/* stake context pill */}
        <Animated.View style={{ position: 'absolute', top: 292 * s, left: 0, right: 0,
          alignItems: 'center', zIndex: 15, opacity: fadeOld }}>
          <View style={{ backgroundColor: COLORS.stakeBg, borderWidth: 1.5 * s, borderColor: COLORS.stakeBorder,
            borderRadius: 40 * s, paddingVertical: 14 * s, paddingHorizontal: 44 * s }}>
            <Text style={{ color: COLORS.lime, fontFamily: FONTS.interExtra, fontSize: 34 * s,
              letterSpacing: 0.06 * 34 * s }}>{fmt(stake)} · WIN {fmt(payout)}</Text>
          </View>
        </Animated.View>

        {/* ── STEP 1: reveal cards ── */}
        <Animated.View style={[cardBox, { top: 430 * s, borderColor: COLORS.lime,
          opacity: Animated.multiply(youIn, fadeOld),
          transform: [{ translateX: youIn.interpolate({ inputRange: [0, 1], outputRange: [-220 * s, 0] }) },
            { translateY: youIn.interpolate({ inputRange: [0, 1], outputRange: [50 * s, 0] }) }] }]}>
          <Text style={lblSt}>YOUR ANSWER</Text>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, lineHeight: 100 * s,
            letterSpacing: 0.02 * 96 * s, color: COLORS.lime }}>{you.answer}</Text>
          <Text style={{ marginTop: 16 * s, fontFamily: FONTS.interExtra, fontSize: 31 * s,
            letterSpacing: 0.12 * 31 * s, color: you.correct ? COLORS.lime : RED }}>
            {you.correct ? '✓ CORRECT' : '✗ WRONG'}</Text>
          <View style={{ position: 'absolute', top: 44 * s, right: 44 * s, backgroundColor: 'rgba(212,242,60,0.10)',
            borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)', borderRadius: 18 * s,
            paddingVertical: 14 * s, paddingHorizontal: 26 * s }}>
            <Text style={monoChip}>{you.time.toFixed(2)}s</Text>
          </View>
        </Animated.View>
        <Animated.View style={[cardBox, { top: 818 * s,
          opacity: Animated.multiply(oppIn, fadeOld),
          transform: [{ translateX: oppIn.interpolate({ inputRange: [0, 1], outputRange: [220 * s, 0] }) },
            { translateY: oppIn.interpolate({ inputRange: [0, 1], outputRange: [50 * s, 0] }) }] }]}>
          <Text style={lblSt}>RIVAL</Text>
          <OppFlip subscribe={subscribe} freezeAt={FT} TL={TL} answer={opp.answer} s={s} />
          <OppStat subscribe={subscribe} freezeAt={FT} TL={TL} correct={opp.correct} s={s} />
        </Animated.View>

        {/* ── STEP 2: the race ── */}
        <Animated.View style={{ position: 'absolute', left: 72 * s, right: 72 * s, top: 1224 * s,
          zIndex: 15, opacity: Animated.multiply(raceIn, isLoss
            ? mkFlash([[E, 1], [E + 750, 1], [E + 1030, 0]]) : fadeOld) }}>
          <Text style={{ textAlign: 'center', fontFamily: FONTS.interExtra, fontSize: 31 * s,
            letterSpacing: 0.3 * 31 * s, color: COLORS.creamDim }}>WHO WAS FASTER?</Text>
          <Animated.Text style={{ textAlign: 'center', marginTop: 10 * s, fontFamily: FONTS.interExtra,
            fontSize: 24 * s, letterSpacing: 0.22 * 24 * s, color: RED, opacity: tagOp }}>
            ⏱ 0.3× TIME DILATION</Animated.Text>
          {[{ who: 'YOU', lock: you.time, frac: youFracI, wins: youWins, you: true },
            { who: 'RIVAL', lock: opp.time, frac: oppFracI, wins: !youWins && !isDraw, you: false }].map((L, i) => (
            <View key={L.who} style={{ marginTop: i === 0 ? 42 * s : 48 * s }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s,
                  letterSpacing: 0.14 * 32 * s, color: COLORS.cream }}>{L.who}</Text>
                <RaceNum subscribe={subscribe} freezeAt={FT} TL={TL} lock={L.lock} wins={L.wins}
                  style={{ fontFamily: FONTS.mono, fontSize: 58 * s }} />
              </View>
              <View style={{ marginTop: 14 * s, height: 24 * s, borderRadius: 12 * s,
                backgroundColor: 'rgba(245,241,230,0.10)', overflow: 'visible' }}>
                <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: TRACK_W,
                  borderRadius: 12 * s, transform: barT(L.frac),
                  opacity: L.you ? youFillOp : 1,
                  backgroundColor: L.you ? COLORS.lime : '#FFB3A8' }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -23 * s,
                  width: 70 * s, height: 70 * s, borderRadius: 35 * s, marginLeft: -35 * s,
                  backgroundColor: L.you ? 'rgba(215,248,74,0.55)' : 'rgba(255,138,110,0.5)',
                  opacity: Animated.multiply(
                    L.frac.interpolate({ inputRange: [0.001, 0.02, L.lock / TL.maxT - 0.01, L.lock / TL.maxT],
                      outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
                    seg(clock, TL.RACE_END - 1, 2, 1, 0)),
                  transform: [{ translateX: L.frac.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W] }) }] }}>
                  <View style={{ position: 'absolute', left: 20 * s, top: 20 * s, width: 30 * s, height: 30 * s,
                    borderRadius: 15 * s, backgroundColor: 'rgba(255,255,245,0.95)' }} />
                </Animated.View>
              </View>
            </View>
          ))}
          {/* THE GAP stamp */}
          <Animated.View style={{ marginTop: 46 * s, alignItems: 'center',
            opacity: isMiss ? Animated.multiply(gapIn, mkFlash([[E, 1], [E + 250, 0]])) : gapIn,
            transform: [{ scale: gapScale }] }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 78 * s, lineHeight: 84 * s,
              color: youWins ? COLORS.lime : RED }}>{gapTxt}</Text>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 25 * s, marginTop: 6 * s,
              letterSpacing: 0.34 * 25 * s, color: COLORS.creamDim }}>THE GAP</Text>
          </Animated.View>
        </Animated.View>

        {/* finish line + smash ring */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 949 * s, top: 1398 * s,
          width: 9 * s, height: 242 * s, borderRadius: 4 * s, backgroundColor: COLORS.lime,
          opacity: finOp, zIndex: 16, transform: [{ scaleY: finScaleY }],
          shadowColor: COLORS.lime, shadowOpacity: 0.8, shadowRadius: 24 * s, shadowOffset: { width: 0, height: 0 } }} />
        <Ring p={finShockP} o={finShockO} color={COLORS.lime} size={220} cx={952} cy={1519} bw={9} />
        {TL.CLOSE ? <EkgLine subscribe={subscribe} freezeAt={FT} TL={TL} s={s} /> : null}
        {isLoss ? <CrumbleFrags subscribe={subscribe} freezeAt={FT} TL={TL} s={s} youFrac={you.time / TL.maxT} /> : null}

        {/* ── STEP 3: explode ── */}
        {!isDraw ? (
          <>
            <Animated.Text style={{ position: 'absolute', top: 350 * s, left: 0, right: 0, textAlign: 'center',
              fontFamily: FONTS.interBlack, fontSize: 37 * s, letterSpacing: 0.42 * 37 * s,
              color: isWin ? COLORS.lime : RED, opacity: eyebrowIn, zIndex: 20,
              transform: [{ translateY: eyebrowY }] }}>{eyebrowTxt}</Animated.Text>
            <Animated.Text style={{ position: 'absolute', top: 486 * s, left: 0, right: 0, textAlign: 'center',
              fontFamily: FONTS.anton, fontSize: 226 * s, lineHeight: 238 * s,
              color: isWin ? COLORS.lime : COLORS.cream, opacity: hlOp, zIndex: 20,
              textShadowColor: isWin ? 'rgba(215,248,74,0.35)' : 'rgba(255,90,72,0.4)',
              textShadowRadius: 40 * s, textShadowOffset: { width: 0, height: 8 * s },
              transform: [{ translateY: hlY }, { scale: hlScale }] }}>{headlineTxt}</Animated.Text>
          </>
        ) : null}

        {/* WIN: rays + payout hero + speed pill */}
        {isWin ? (
          <>
            {Array.from({ length: 12 }).map((_, i) => (
              <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute',
                left: (512 - 7) * s, top: 600 * s, width: 14 * s, height: 430 * s,
                backgroundColor: COLORS.lime, opacity: rayOp, zIndex: 44,
                transform: [{ translateY: -215 * s }, { rotate: (i / 12) * 360 + 15 + 'deg' },
                  { translateY: 215 * s },
                  { scaleY: rayP.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1.7] }) },
                  { scaleX: rayP.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }] }} />
            ))}
            <ConfettiBurst clock={clock} hit={E + HIT} s={s} />
            <Animated.Text pointerEvents="none" style={{ position: 'absolute', top: 756 * s, left: 0, right: 0,
              textAlign: 'center', fontFamily: FONTS.anton, fontSize: 190 * s, lineHeight: 200 * s,
              color: COLORS.lime, opacity: heroOp, zIndex: 46,
              textShadowColor: 'rgba(212,242,60,0.75)', textShadowRadius: 30 * s,
              textShadowOffset: { width: 0, height: 0 },
              transform: [{ translateX: heroX }, { translateY: heroY }, { scale: heroScale }] }}>
              +{fmt(payout)}</Animated.Text>
            <Ring p={heroShockP} o={heroShockO} color="#FFFFFF" cx={512} cy={851} />
            {pillLabel ? (
              <Animated.View style={{ position: 'absolute', top: 742 * s, left: 0, right: 0,
                alignItems: 'center', opacity: pillIn, zIndex: 22,
                transform: [{ rotate: '-8deg' }, { scale: pillScale }] }}>
                <View style={{ backgroundColor: COLORS.forest, borderWidth: 3 * s, borderColor: COLORS.lime,
                  borderRadius: 48 * s, paddingVertical: 18 * s, paddingHorizontal: 42 * s,
                  shadowColor: COLORS.lime, shadowOpacity: 0.45, shadowRadius: 30 * s, shadowOffset: { width: 0, height: 0 } }}>
                  <Text style={{ fontFamily: FONTS.interBlack, fontSize: 40 * s, letterSpacing: 0.1 * 40 * s,
                    color: COLORS.lime }}>{pillLabel} {you.time.toFixed(1)}s</Text>
                </View>
              </Animated.View>
            ) : null}
          </>
        ) : null}

        {/* LOSS: rival anchor + BEAT THAT */}
        {isLoss ? (
          <Animated.View style={{ position: 'absolute', top: 790 * s, left: 0, right: 0,
            alignItems: 'center', opacity: anchorIn, zIndex: 20, transform: [{ translateY: anchorY }] }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 35 * s, letterSpacing: 0.16 * 35 * s,
              color: COLORS.creamDim }}>RIVAL HIT <Text style={{ fontFamily: FONTS.mono, fontSize: 44 * s,
              color: COLORS.lime }}>{opp.time.toFixed(2)}s</Text></Text>
            <Animated.Text style={{ marginTop: 14 * s, fontFamily: FONTS.interBlack, fontSize: 42 * s,
              letterSpacing: 0.3 * 42 * s, color: COLORS.cream, transform: [{ scale: beatPulse }] }}>
              BEAT THAT.</Animated.Text>
          </Animated.View>
        ) : null}

        {/* NEARMISS: gap monument -> collapses into PLAY AGAIN */}
        {isMiss ? (
          <>
            <Animated.Text pointerEvents="none" style={{ position: 'absolute', top: 760 * s, left: 0, right: 0,
              textAlign: 'center', fontFamily: FONTS.anton, fontSize: 230 * s, lineHeight: 242 * s,
              color: RED, opacity: monOp, zIndex: 24,
              textShadowColor: 'rgba(255,90,72,0.65)', textShadowRadius: 40 * s,
              textShadowOffset: { width: 0, height: 6 * s },
              transform: [{ translateY: monY }, { scale: monScale }] }}>
              {(you.time - opp.time).toFixed(2)}s</Animated.Text>
            <Animated.Text pointerEvents="none" style={{ position: 'absolute', top: 1020 * s, left: 0, right: 0,
              textAlign: 'center', fontFamily: FONTS.interBlack, fontSize: 30 * s,
              letterSpacing: 0.42 * 30 * s, color: RED, opacity: monLblOp, zIndex: 24 }}>THE GAP</Animated.Text>
          </>
        ) : null}

        {/* DRAW: lime split + mirrored avatars + stamp + refund pill (batch6/draw.png) */}
        {isDraw ? (
          <>
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: (512 - 4) * s, top: 480 * s,
              width: 8 * s, height: 1080 * s, borderRadius: 4 * s, backgroundColor: COLORS.lime, zIndex: 20,
              opacity: splitIn, transform: [{ scaleY: splitIn }],
              shadowColor: COLORS.lime, shadowOpacity: 0.7, shadowRadius: 24 * s, shadowOffset: { width: 0, height: 0 } }} />
            {[{ cx: 300, av: avInL, time: you.time }, { cx: 724, av: avInR, time: opp.time }].map((P, i) => (
              <Animated.View key={i} style={{ position: 'absolute', left: (P.cx - 130) * s, top: 560 * s,
                alignItems: 'center', width: 260 * s, opacity: P.av, zIndex: 20,
                transform: [{ scale: P.av.interpolate({ inputRange: [0, 1.2], outputRange: [0.4, 1.2], extrapolate: 'extend' }) }] }}>
                <Image source={AVATAR} style={{ width: 260 * s, height: 260 * s, borderRadius: 130 * s,
                  borderWidth: 6 * s, borderColor: COLORS.lime }} />
                <Text style={{ marginTop: 60 * s, fontFamily: FONTS.mono, fontSize: 64 * s, color: COLORS.cream }}>
                  {P.time.toFixed(2)}s</Text>
              </Animated.View>
            ))}
            <Animated.Text pointerEvents="none" style={{ position: 'absolute', top: 1180 * s, left: 0, right: 0,
              textAlign: 'center', fontFamily: FONTS.anton, fontSize: 240 * s, lineHeight: 252 * s,
              color: COLORS.cream, opacity: stampOp, zIndex: 24,
              textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 2 * s, textShadowOffset: { width: 0, height: 10 * s },
              transform: [{ rotate: '-8deg' }, { scale: stampScale }] }}>DRAW</Animated.Text>
            <Animated.View style={{ position: 'absolute', top: 1640 * s, left: 0, right: 0,
              alignItems: 'center', opacity: refundIn, zIndex: 20,
              transform: [{ translateY: refundIn.interpolate({ inputRange: [0, 1], outputRange: [30 * s, 0] }) }] }}>
              <View style={{ backgroundColor: 'rgba(16,20,13,0.86)', borderWidth: 2 * s,
                borderColor: 'rgba(245,241,230,0.5)', borderRadius: 44 * s,
                paddingVertical: 20 * s, paddingHorizontal: 52 * s }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, letterSpacing: 0.1 * 36 * s,
                  color: COLORS.cream }}>STAKE RETURNED · {fmt(stake)}</Text>
              </View>
            </Animated.View>
          </>
        ) : null}

        {/* shockwave rings */}
        {rings.map((r, i) => <Ring key={i} p={r.scale} o={r.op} color={r.color} />)}

        {/* result card + stats + mode line (not on draw — per locked mockup) */}
        {!isDraw ? (
          <>
            <Animated.Text style={{ position: 'absolute', top: 1166 * s, left: 0, right: 0, textAlign: 'center',
              fontFamily: FONTS.interExtra, fontSize: 25 * s, letterSpacing: 0.3 * 25 * s,
              color: COLORS.creamDim, opacity: cardIn, zIndex: 18 }}>
              ONLINE MATCH · {fmt(stake)} STAKE</Animated.Text>
            <Animated.View style={{ position: 'absolute', top: 1222 * s, left: 60 * s, right: 60 * s,
              backgroundColor: 'rgba(16,20,13,0.86)', borderWidth: 2.5 * s, borderColor: 'rgba(215,248,74,0.55)',
              borderRadius: 28 * s, paddingVertical: 36 * s, paddingHorizontal: 52 * s, zIndex: 18,
              opacity: cardIn, transform: [{ translateY: cardY }] }}>
              <View style={{ flexDirection: 'row', paddingBottom: 22 * s, paddingTop: 10 * s }}>
                {['RESULT', 'ANSWER', 'TIME'].map((h, i) => (
                  <Text key={h} style={{ width: i === 0 ? 190 * s : i === 2 ? 250 * s : undefined, flex: i === 1 ? 1 : 0,
                    textAlign: i === 2 ? 'right' : 'left', fontFamily: FONTS.interExtra, fontSize: 26 * s,
                    letterSpacing: 0.2 * 26 * s, color: COLORS.creamDim }}>{h}</Text>
                ))}
              </View>
              {[{ who: 'YOU', ans: you.answer + mark(you.correct), time: you.time.toFixed(2) + 's', me: true },
                { who: 'RIVAL', ans: opp.answer + (opp.correct ? '' : ' ✗'), time: opp.time.toFixed(2) + 's', me: false },
                { who: 'CORRECT ANSWER', ans: correctAnswer, time: '', corr: true }].map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 26 * s,
                  borderTopWidth: 1.5 * s, borderTopColor: 'rgba(245,241,230,0.14)' }}>
                  <Text style={{ width: 190 * s, fontFamily: r.corr ? FONTS.interExtra : FONTS.interBlack,
                    fontSize: (r.corr ? 26 : 36) * s, letterSpacing: 0.06 * 36 * s,
                    color: r.corr ? COLORS.creamDim : COLORS.cream }}>{r.who}</Text>
                  <Text style={{ flex: 1, fontFamily: FONTS.anton, fontSize: (r.corr ? 48 : 52) * s,
                    letterSpacing: 0.03 * 52 * s,
                    color: r.me || r.corr ? COLORS.lime : COLORS.creamDim }}>{r.ans}</Text>
                  <Text style={{ width: 250 * s, textAlign: 'right', fontFamily: FONTS.mono, fontSize: 42 * s,
                    color: r.me ? COLORS.lime : COLORS.creamDim }}>{r.time}</Text>
                </View>
              ))}
            </Animated.View>
            <Animated.Text style={{ position: 'absolute', top: 1768 * s, left: 0, right: 0, textAlign: 'center',
              fontFamily: FONTS.interExtra, fontSize: 34 * s, letterSpacing: 0.16 * 34 * s,
              color: COLORS.creamDim, opacity: cardIn, zIndex: 18 }}>{statsTxt}</Animated.Text>
          </>
        ) : null}

        {/* PLAY AGAIN (lime, idle pulse, nearmiss ignite) + ghost HOME */}
        <Animated.View style={{ position: 'absolute', top: 1848 * s, left: 60 * s, right: 60 * s,
          zIndex: 28, opacity: btnIn, transform: [{ translateY: btnY }, { scale: btnScale }] }}>
          <Pressable onPress={onPlayAgain} style={{ height: 152 * s, borderRadius: 30 * s,
            backgroundColor: COLORS.lime, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            shadowColor: COLORS.lime, shadowOpacity: 0.25, shadowRadius: 40 * s, shadowOffset: { width: 0, height: 12 * s } }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 66 * s, letterSpacing: 0.06 * 66 * s,
              color: '#10140C' }}>PLAY AGAIN</Text>
            {isMiss ? (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '-20%', bottom: '-20%',
                width: 240 * s, backgroundColor: 'rgba(255,255,255,0.55)',
                transform: [{ translateX: shimmerX }, { rotate: '14deg' }] }} />
            ) : null}
          </Pressable>
          {isMiss ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -8 * s, left: -8 * s,
              right: -8 * s, height: 168 * s, borderRadius: 36 * s, borderWidth: 5 * s,
              borderColor: COLORS.lime, opacity: igniteGlow }} />
          ) : null}
        </Animated.View>
        <Animated.View style={{ position: 'absolute', top: 2038 * s, left: 60 * s, right: 60 * s,
          zIndex: 28, opacity: btnIn }}>
          <Pressable onPress={onHome} style={{ height: 112 * s, borderRadius: 26 * s,
            borderWidth: 2.5 * s, borderColor: 'rgba(245,241,230,0.4)', backgroundColor: 'rgba(16,20,13,0.6)',
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 40 * s, letterSpacing: 0.22 * 40 * s,
              color: COLORS.cream }}>HOME</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* full-screen flashes (outside the shaker, like the HTML) */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(212,242,60,1)', opacity: flashLime, zIndex: 60 }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#FFFFFF', opacity: flashWhite, zIndex: 60 }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(239,68,68,1)', opacity: flashRed, zIndex: 60 }} />
    </View>
  );
}

/* rival status line: '...' until the flip completes */
function OppStat({ subscribe, freezeAt, TL, correct, s }) {
  const t = useT(subscribe, freezeAt);
  const shown = t >= TL.FLIP + 150;
  return (
    <Text style={{ marginTop: 16 * s, fontFamily: FONTS.interExtra, fontSize: 31 * s,
      letterSpacing: 0.12 * 31 * s, color: shown ? (correct ? COLORS.cream : RED) : COLORS.creamDim }}>
      {shown ? (correct ? '✓ CORRECT' : '✗ WRONG') : '...'}</Text>
  );
}
