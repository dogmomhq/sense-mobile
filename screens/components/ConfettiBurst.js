// ── Pooled confetti burst (WIN explode) ─────────────────────────────────────
// 120 Animated.Views, seeded -> deterministic, transforms/opacity only.
// Bills/coins from the HTML spec are simplified into colored confetti
// variants (perf: keeps the simultaneous animated-view count ~150 total).
// Stage 1 (80): radial burst from the slam center released at `hit`.
// Stage 2 (40): slow rain from the top, staggered after the burst.
import React from 'react';
import { Animated } from 'react-native';
import { COLORS, REDUCED_FX } from '../theme';

const N = REDUCED_FX ? 60 : 120, N1 = REDUCED_FX ? 40 : 80;
const PALETTE = [COLORS.lime, COLORS.cream, COLORS.flameOut, COLORS.flameIn, COLORS.lime, COLORS.cream];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const outCubic = (p) => 1 - Math.pow(1 - p, 3);

// keyframe sampler: maps clock(ms) -> value arrays for Animated.interpolate
function kf(clock, t0, t1, fn, steps = 8) {
  const inR = [], outR = [];
  for (let i = 0; i <= steps; i++) {
    inR.push(t0 + ((t1 - t0) * i) / steps);
    outR.push(fn(i / steps));
  }
  return clock.interpolate({ inputRange: inR, outputRange: outR, extrapolate: 'clamp' });
}

export default function ConfettiBurst({ clock, hit, s, seed = 7 }) {
  const parts = React.useMemo(() => {
    const rnd = mulberry32(seed * 311 + 5);
    const arr = [];
    for (let i = 0; i < N; i++) {
      const stage1 = i < N1;
      arr.push({
        born: stage1 ? hit + rnd() * 110 : hit + 340 + rnd() * 760,
        dur: stage1 ? 650 + rnd() * 550 : 1000 + rnd() * 800,
        x0: stage1 ? 512 : 160 + rnd() * 700,
        y0: stage1 ? 900 : 200 + rnd() * 480,
        dx: stage1 ? (rnd() - 0.5) * 920 : (rnd() - 0.5) * 560,
        dy: stage1 ? -(280 + rnd() * 680) : 380 + rnd() * 680,
        rot: stage1 ? (rnd() - 0.5) * 900 : rnd() * 360,
        w: 16 + rnd() * 26,
        dot: rnd() < 0.4,
        color: PALETTE[Math.floor(rnd() * PALETTE.length)],
        stage1,
      });
    }
    return arr;
  }, [hit, seed]);

  return (
    <>
      {parts.map((p, i) => {
        const t0 = p.born, t1 = p.born + p.dur;
        const tx = kf(clock, t0, t1, (q) =>
          (p.stage1 ? p.x0 + p.dx * outCubic(q) : p.x0 + p.dx * q) * s);
        const ty = kf(clock, t0, t1, (q) =>
          (p.stage1 ? p.y0 + p.dy * outCubic(q) + 520 * q * q : p.y0 + p.dy * q * q) * s, 10);
        const rot = clock.interpolate({ inputRange: [t0, t1],
          outputRange: ['0deg', p.rot + 'deg'], extrapolate: 'clamp' });
        const sc = clock.interpolate({ inputRange: [t0, t1],
          outputRange: [1, p.stage1 ? 0.35 : 0.7], extrapolate: 'clamp' });
        const op = clock.interpolate({
          inputRange: [t0 - 1, t0, t0 + p.dur * 0.6, t1, t1 + 1],
          outputRange: [0, 1, 1, 0, 0], extrapolate: 'clamp' });
        return (
          <Animated.View key={i} pointerEvents="none" style={{
            position: 'absolute', left: 0, top: 0,
            width: p.w * s, height: (p.dot ? p.w : p.w * 0.6) * s,
            borderRadius: p.dot ? (p.w * s) / 2 : 3 * s,
            backgroundColor: p.color, opacity: op, zIndex: 50,
            transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }, { scale: sc }],
          }} />
        );
      })}
    </>
  );
}
