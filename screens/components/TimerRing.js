// ── SENSE timer ring — port of anim_gallery/question_ring_FINAL.html ────────
// Two locked modes, selected by the `mode` prop:
//
//   mode="laser"  Pure geometry, react-native-svg only (zero particles):
//                 0.06-alpha elapsed track, 28px breathing bloom (±8% @1.2Hz),
//                 14px lime beam + 6px white-hot core, 8-segment afterimage arc
//                 (1s of sweep = 36°), 80px light pulse sweeping head→tail
//                 every 2s, lens-point cross-flare + hot dot at the leading
//                 end, amber→red urgency shift under 3s with a 2Hz pulse.
//
//   mode="fuse"   SVG ring (remaining lime arc + pale burnt trail + ember
//                 head) + welding-spark particle layer + flickering 3-layer
//                 white-hot core. See <FuseSparks/> below.
//
// Pure render from `secondsLeft` (10.0 → 0.0); the screen drives it.
//
// ── PERF TRADEOFF (honest) ──────────────────────────────────────────────────
// The HTML spec runs a pooled 600-particle Canvas2D engine with additive
// blending, per-particle texture rotation/stretch, and 4-position motion
// trails — one draw surface, ~zero per-frame allocation. This repo does NOT
// ship @shopify/react-native-skia (checked package.json), and per the build
// rules we don't add heavy deps for one effect. So the fuse mode here uses a
// pool of MAX_P (=96) absolutely-positioned <Image> views (the 8 spark
// textures in assets/sparks/) repositioned by a JS sim tick at ~30fps via a
// single setState per tick. That means:
//   • ~6x fewer particles than the spec (96 vs 600) — density is lower.
//   • No additive ('lighter') blending — overlapping sparks don't bloom.
//   • Motion trails simplified to 1 ghost copy (spec draws 4-pos streaks).
//   • Color temperature approximated with Image tintColor per age bucket
//     (white→yellow→orange→red) instead of per-pixel gradient tinting.
//   • Each tick re-renders ~100 lightweight views; on mid-range Android this
//     costs ~3-5ms of JS + layout. Acceptable for a 10s screen; if profiling
//     shows drops, lower MAX_P / TICK_HZ, or migrate to Skia Atlas (one draw
//     call) when/if skia is added.
// What IS preserved exactly from the spec: the directional emission sampler
// (55% backward cone ±50°, 35% radial ±40°, 10% anywhere outside the forward
// ±35° wedge), speeds 260–1200px/s, gravity ~500, floor bounce at y≈1770
// with 0.4 energy, 18% mid-flight poppers bursting into 3–5 children,
// crackle bursts every 200–500ms, seeded deterministic PRNG, and the
// violently flickering 30Hz white core with 1.4x pops.
import React, { useEffect, useRef, useState } from 'react';
import { View, Image } from 'react-native';
import * as RNSvg from 'react-native-svg';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS, useScale } from '../theme';

const R = 396, CX = 420, CY = 420;
const RING_OX = 92, RING_OY = 430;            // ring-wrap offset inside 1024x2224 screen
const FLOOR_Y = 1770;                         // invisible floor ≈ answers top edge

const HAS_FILTERS = !!(RNSvg.Filter && RNSvg.FeGaussianBlur && RNSvg.FeMerge && RNSvg.FeMergeNode);
const { Filter, FeGaussianBlur, FeMerge, FeMergeNode, Defs } = RNSvg;

// 8 luminance-keyed spark textures from the spec (0-5 horizontal streaks, 6-7 round glints)
const TEX = [
  require('../../assets/sparks/spark0.png'), require('../../assets/sparks/spark1.png'),
  require('../../assets/sparks/spark2.png'), require('../../assets/sparks/spark3.png'),
  require('../../assets/sparks/spark4.png'), require('../../assets/sparks/spark5.png'),
  require('../../assets/sparks/spark6.png'), require('../../assets/sparks/spark7.png'),
];
const TEX_AR = [39/64, 19/64, 31/64, 29/63, 34/64, 33/64, 1, 1]; // h/w per texture

function pt(aDeg, r = R) {
  const a = (aDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}
function arcPath(a0, a1) {
  let span = a1 - a0;
  if (span < 0.05) span = 0.05;
  if (span > 359.9) span = 359.9;             // 360° SVG arcs degenerate to nothing
  a1 = a0 + span;
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const large = span > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

// ── deterministic RNG (spec-identical) ──
const SEED = 7;
function hrand(k, salt) {
  let x = (SEED ^ Math.imul(k + 1, 2654435761) ^ Math.imul(salt + 1, 1597334677)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519); x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// welding color temperature buckets (spec tempColor) → tintColor
function tempTint(heat) {
  if (heat > 0.85) return '#FFFFF0';   // white-hot
  if (heat > 0.55) return '#FFE082';   // yellow
  if (heat > 0.28) return '#FF9632';   // orange
  return '#CD3714';                    // deep red
}

// glow stroke helper (filters when available, layered-stroke halo otherwise)
function GlowPath({ d, stroke, width, opacity = 1, glow }) {
  if (!glow) return <Path d={d} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none" opacity={opacity} />;
  if (HAS_FILTERS) return (
    <Path d={d} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none" opacity={opacity}
      filter={glow === 'big' ? 'url(#srGlowBig)' : 'url(#srGlow)'} />
  );
  const extra = glow === 'big' ? 44 : 20;
  return (
    <>
      <Path d={d} stroke={stroke} strokeWidth={width + extra} strokeLinecap="round" fill="none"
        opacity={opacity * (glow === 'big' ? 0.22 : 0.28)} />
      <Path d={d} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none" opacity={opacity} />
    </>
  );
}

// ── FUSE particle layer: pooled Image views + JS sim tick ──────────────────
const MAX_P = 96;
const TICK_MS = 33;                    // ~30fps sim; render = one setState/tick
function makePool() {
  const pool = [];
  for (let i = 0; i < MAX_P; i++) pool.push({ alive: false, x: 0, y: 0, px: 0, py: 0,
    vx: 0, vy: 0, age: 0, life: 1, size: 10, tex: 0, drag: 1.1, grav: 520,
    glint: false, bounce: false, burstAt: 0 });
  return pool;
}

function FuseSparks({ tLeft }) {
  const s = useScale();
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = {
    pool: makePool(), rnd: mulberry32(SEED * 7919 + 3),
    spawnAcc: 0, crackleAt: 0.2, floatAcc: 0, T: Math.max(0, 10 - tLeft), prefilled: false,
  };
  const tRef = useRef(tLeft); tRef.current = tLeft;
  const [, bump] = useState(0);

  useEffect(() => {
    const st = stateRef.current;
    const headAt = (T) => {           // head xy (screen coords) + travel angle at sim time T
      const a = (Math.max(0, Math.min(10, T)) / 10) * 2 * Math.PI;
      return { x: CX + R * Math.sin(a) + RING_OX, y: CY - R * Math.cos(a) + RING_OY, a };
    };
    const adiff = (a, b) => { let d = (a - b) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const FWD_EX = 0.6109;            // forward ±35° exclusion wedge

    function spawn(x, y, vx, vy, life, size, tex, drag, grav, glint, bounce, burstAt) {
      const pool = st.pool;
      for (let i = 0; i < MAX_P; i++) {
        const p = pool[i];
        if (!p.alive) {
          p.alive = true; p.age = 0; p.x = p.px = x; p.y = p.py = y; p.vx = vx; p.vy = vy;
          p.life = life; p.size = size; p.tex = tex; p.drag = drag; p.grav = grav;
          p.glint = glint; p.bounce = !!bounce; p.burstAt = burstAt || 0;
          return;
        }
      }
    }

    function step(dt, T) {
      const rnd = st.rnd;
      const { x: hx, y: hy, a: ha } = headAt(T);
      const nx = Math.sin(ha), ny = -Math.cos(ha);   // outward radial unit
      // spec direction sampler: 55% backward cone ±50°, 35% radial ±40°,
      // 10% anywhere except the forward ±35° wedge
      function emitA() {
        const r = rnd();
        if (r < 0.55) return ha + Math.PI + (rnd() * 2 - 1) * 0.8727;
        if (r < 0.90) return ha + (rnd() < 0.5 ? -1 : 1) * Math.PI / 2 + (rnd() * 2 - 1) * 0.6981;
        let a; do { a = rnd() * Math.PI * 2; } while (Math.abs(adiff(a, ha)) < FWD_EX);
        return a;
      }
      // main welding needles (spec: 11-18 @60fps; here 3-5 @30fps — pool-capped)
      st.spawnAcc += dt * 30;
      while (st.spawnAcc >= 1) {
        st.spawnAcc -= 1;
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const a = emitA();
          const sp = 260 + rnd() * 940;                    // 260-1200 px/s
          const life = 0.3 + rnd() * 0.78;
          const bAt = rnd() < 0.18 ? life * (0.3 + rnd() * 0.45) : 0;  // 18% poppers
          spawn(hx, hy, Math.cos(a) * sp + nx * 140, Math.sin(a) * sp + ny * 60 + 90,
            life, 14 + rnd() * 34, Math.floor(rnd() * 6), 1.1, 520, false, rnd() < 0.55, bAt);
        }
      }
      // crackle burst every 200-500ms (spec: 18-30; here 8-12)
      st.crackleAt -= dt;
      if (st.crackleAt <= 0) {
        st.crackleAt = 0.2 + rnd() * 0.3;
        const n = 8 + Math.floor(rnd() * 5), base = rnd() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          let a = base + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
          if (Math.abs(adiff(a, ha)) < FWD_EX) a += Math.PI;  // fold forward crackle backward
          const sp = 700 + rnd() * 600;
          spawn(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp,
            0.16 + rnd() * 0.26, 8 + rnd() * 12, Math.floor(rnd() * 6), 2.2, 520, false, rnd() < 0.4, 0);
        }
      }
      // floater embers ~2/s, long-lived glints
      st.floatAcc += dt * 2;
      while (st.floatAcc >= 1) {
        st.floatAcc -= 1;
        const a = emitA(), sp = 200 + rnd() * 450;
        spawn(hx, hy, Math.cos(a) * sp + nx * 180, Math.sin(a) * sp + 60,
          1.5 + rnd() * 1.9, 8 + rnd() * 12, 6 + Math.floor(rnd() * 2), 0.4, 130, true, true, 0);
      }
      // integrate (object reuse only)
      for (let i = 0; i < MAX_P; i++) {
        const p = st.pool[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) { p.alive = false; continue; }
        if (p.burstAt > 0 && p.age >= p.burstAt) {          // mid-flight pop → 3-5 children
          p.alive = false;
          const n = 3 + Math.floor(rnd() * 3), va = Math.atan2(p.vy, p.vx), vsp = Math.hypot(p.vx, p.vy);
          for (let c = 0; c < n; c++) {
            const ca = va + (rnd() - 0.5) * 1.7, csp = vsp * (0.45 + rnd() * 0.55);
            spawn(p.x, p.y, Math.cos(ca) * csp, Math.sin(ca) * csp,
              0.14 + rnd() * 0.3, p.size * (0.4 + rnd() * 0.4), Math.floor(rnd() * 6), 1.6, 520, false, rnd() < 0.5, 0);
          }
          continue;
        }
        p.px = p.x; p.py = p.y;                             // 1-ghost motion trail
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.bounce && p.y > FLOOR_Y && p.vy > 0) {        // floor bounce @0.4 energy
          p.y = FLOOR_Y; p.vy = -p.vy * 0.4; p.vx *= 0.75;
        }
      }
    }

    // deterministic prefill: 120 fixed 1/60s steps ending at the current
    // moment, so frozen previews (?t=) show a rich mid-state, not an empty head
    if (!st.prefilled) {
      st.prefilled = true;
      const T0 = Math.max(0, 10 - tRef.current);
      for (let k = 0; k < 120; k++) step(1 / 60, Math.max(0, T0 - (119 - k) / 60));
      st.T = T0;
    }
    const id = setInterval(() => {
      const T = Math.max(0, 10 - tRef.current);
      let dt = T - st.T;
      if (!(dt > 0)) dt = TICK_MS / 1000;   // frozen preview: keep crackling in place
      dt = Math.min(0.05, dt);
      st.T = T;
      step(dt, T);
      bump((x) => x + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // render the pool + flickering core
  const st = stateRef.current;
  const T = Math.max(0, 10 - tLeft);
  const a = (T / 10) * 2 * Math.PI;
  const hx = (CX + R * Math.sin(a) + RING_OX), hy = (CY - R * Math.cos(a) + RING_OY);
  const f1 = 0.8 + hrand(Math.floor(T * 30), 21) * 0.45;
  const f2 = 0.75 + hrand(Math.floor(T * 30), 22) * 0.5;
  const pop = hrand(Math.floor(T * 20), 33) < 0.12 ? 1.4 : 1;
  const sparks = [];
  for (let i = 0; i < MAX_P; i++) {
    const p = st.pool[i];
    if (!p.alive) continue;
    const k = 1 - p.age / p.life;
    const sp = Math.hypot(p.vx, p.vy);
    const heat = k * Math.min(1, 0.35 + sp / 900);
    const tint = tempTint(heat);
    const bright = Math.min(1, k * (0.6 + sp / 1100) * 2.3);   // boosted: no additive blend on RN
    const stretch = p.glint ? 1 : Math.min(3.6, 0.7 + sp / 420);
    const w = p.size * stretch, h = Math.max(2, p.size * TEX_AR[p.tex]);
    const rot = `${Math.atan2(p.vy, p.vx)}rad`;
    const base = { position: 'absolute', width: w * s, height: h * s, resizeMode: 'stretch', tintColor: tint };
    if (!p.glint && sp > 260)                              // 1 ghost copy = simplified trail
      sparks.push(<Image key={`g${i}`} source={TEX[p.tex]} fadeDuration={0} style={{ ...base,
        left: (p.px - w / 2) * s, top: (p.py - h / 2) * s, opacity: bright * 0.3, transform: [{ rotate: rot }] }} />);
    sparks.push(<Image key={i} source={TEX[p.tex]} fadeDuration={0} style={{ ...base,
      left: (p.x - w / 2) * s, top: (p.y - h / 2) * s, opacity: bright, transform: [{ rotate: rot }] }} />);
  }
  const core = (r, color, op) => ({ position: 'absolute', left: (hx - r) * s, top: (hy - r) * s,
    width: r * 2 * s, height: r * 2 * s, borderRadius: r * s, backgroundColor: color, opacity: op });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: 1024 * s, height: 2224 * s, zIndex: 16 }}>
      {/* soft warm glow underlay (spec .spark-glow) */}
      <View style={core(190, 'rgba(255,150,50,0.16)', 0.35 + hrand(Math.floor(T * 14), 5) * 0.3)} />
      {sparks}
      {/* blinding white core: violent 30Hz flicker + occasional 1.4x pop */}
      <View style={core(88 * f2 * pop, 'rgba(255,160,60,0.30)', f2 * 0.8)} />
      <View style={core(46 * f1 * pop, 'rgba(255,228,150,0.75)', f1)} />
      <View style={core(23 * f1 * pop, '#FFFFFF', 1)} />
    </View>
  );
}

// ── main component ──────────────────────────────────────────────────────────
export default function TimerRing({ secondsLeft = 10, mode = 'fuse' }) {
  const s = useScale();
  const tLeft = Math.max(0, Math.min(10, secondsLeft));
  const T = 10 - tLeft;                          // animation time for breathing/pulse
  const headA = (T / 10) * 360;                  // head angle from top, clockwise
  const [hx, hy] = pt(headA);
  const ha = (headA * Math.PI) / 180;

  let body = null;
  if (mode === 'laser') {
    // urgency color: lime → amber → red under 3s, with a 2Hz pulse
    let beamCol = COLORS.lime, pulseAmp = 1;
    if (tLeft < 3) {
      beamCol = tLeft < 1.5 ? '#FF3B30' : '#FFB020';
      pulseAmp = 0.78 + 0.22 * Math.sin(T * 2 * Math.PI * 2);
    }
    const breathe = 1 + 0.08 * Math.sin(T * 1.2 * Math.PI * 2);   // ±8% @1.2Hz
    const remD = headA < 359.5 ? arcPath(headA, 360) : null;
    // 8-segment afterimage over the last 1s of sweep (36°)
    const behind = Math.min(headA, 36);
    const after = [];
    if (behind >= 0.5) for (let i = 0; i < 8; i++) {
      const a1 = headA - behind * (i / 8), a0 = headA - behind * ((i + 1) / 8);
      after.push(<Path key={i} d={arcPath(Math.max(0, a0), Math.max(0.1, a1))} stroke={beamCol}
        strokeWidth={14} strokeLinecap="round" fill="none" opacity={0.38 * (1 - i / 8) * (behind / 36)} />);
    }
    // traveling 80px light pulse: head→tail every 2s (600ms sweep)
    const PW = (80 / R) * 180 / Math.PI;
    const ph = T % 2;
    let pulse = null;
    if (ph < 0.6 && headA < 355) {
      const prog = ph / 0.6;
      const c = headA + prog * (360 - headA);
      pulse = <Path d={arcPath(Math.max(headA, c - PW / 2), Math.min(360, c + PW / 2))}
        stroke="#FFFFFF" strokeWidth={14} strokeLinecap="round" fill="none"
        opacity={0.85 * Math.sin(prog * Math.PI)} />;
    }
    const tx = Math.cos(ha), ty = Math.sin(ha);    // tangent
    const rx = Math.sin(ha), ry = -Math.cos(ha);   // radial
    body = (
      <>
        {/* elapsed track: near-invisible dark glass */}
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(245,241,230,0.06)" strokeWidth={14} />
        {after}
        {remD ? (
          <>
            <Path d={remD} stroke={beamCol} strokeWidth={28} strokeLinecap="round" fill="none"
              opacity={0.30 * breathe * pulseAmp} />
            <Path d={remD} stroke={beamCol} strokeWidth={14} strokeLinecap="round" fill="none"
              opacity={0.95 * pulseAmp} />
            <Path d={remD} stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" fill="none"
              opacity={pulseAmp} />
          </>
        ) : null}
        {pulse}
        {/* lens-point cross-flare + hot dot at the leading end */}
        <Line x1={hx - tx * 30} y1={hy - ty * 30} x2={hx + tx * 30} y2={hy + ty * 30}
          stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={hx - rx * 30} y1={hy - ry * 30} x2={hx + rx * 30} y2={hy + ry * 30}
          stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round" />
        <Circle cx={hx} cy={hy} r={8} fill="#FFFFFF" />
      </>
    );
  } else {
    // FUSE: burnt trail + remaining laser arc + ember head (particles overlay)
    body = (
      <>
        {headA > 0.5 ? (
          <>
            <GlowPath d={arcPath(0, headA)} stroke={COLORS.burntGlow} width={22} glow="small" />
            <Path d={arcPath(0, headA)} stroke={COLORS.burntCore} strokeWidth={12} strokeLinecap="round" fill="none" />
          </>
        ) : null}
        {headA < 359.5 ? (
          <>
            <GlowPath d={arcPath(headA, 360)} stroke={COLORS.lime} width={30} opacity={0.35} glow="big" />
            <GlowPath d={arcPath(headA, 360)} stroke={COLORS.lime} width={14} opacity={0.95} glow="small" />
            <Path d={arcPath(headA, 360)} stroke={COLORS.fuseCore} strokeWidth={5} strokeLinecap="round" fill="none" />
          </>
        ) : null}
        {HAS_FILTERS
          ? <Circle cx={hx} cy={hy} r={26} fill={COLORS.emberOuter} filter="url(#srGlow)" />
          : <><Circle cx={hx} cy={hy} r={40} fill={COLORS.emberOuter} opacity={0.35} /><Circle cx={hx} cy={hy} r={26} fill={COLORS.emberOuter} /></>}
        <Circle cx={hx} cy={hy} r={13} fill={COLORS.white} />
      </>
    );
  }

  return (
    <>
      <View pointerEvents="none"
        style={{ position: 'absolute', top: RING_OY * s, left: RING_OX * s, width: 840 * s, height: 840 * s, zIndex: 15 }}>
        <Svg width={840 * s} height={840 * s} viewBox="0 0 840 840" style={{ overflow: 'visible' }}>
          {HAS_FILTERS && mode === 'fuse' ? (
            <Defs>
              <Filter id="srGlow" x="-60%" y="-60%" width="220%" height="220%">
                <FeGaussianBlur stdDeviation={10} result="b" />
                <FeMerge><FeMergeNode in="b" /><FeMergeNode in="SourceGraphic" /></FeMerge>
              </Filter>
              <Filter id="srGlowBig" x="-80%" y="-80%" width="260%" height="260%">
                <FeGaussianBlur stdDeviation={22} result="b" />
                <FeMerge><FeMergeNode in="b" /><FeMergeNode in="SourceGraphic" /></FeMerge>
              </Filter>
            </Defs>
          ) : null}
          {body}
          {/* centered seconds — small, quiet, always readable */}
          <Circle cx={CX} cy={CY} r={86} fill="rgba(11,15,10,0.55)" />
          <SvgText x={CX} y={CY + 1} textAnchor="middle" alignmentBaseline="central"
            fontFamily={FONTS.mono} fontSize={64} fill={COLORS.lime} opacity={0.95}>
            {tLeft.toFixed(1)}
          </SvgText>
        </Svg>
      </View>
      {mode === 'fuse' ? <FuseSparks tLeft={tLeft} /> : null}
    </>
  );
}
