// ── COUNTDOWN (1:1 port of anim_gallery/countdown_final.html, slam variant) ──
// LOCKED LOOK: faded eye photo (brightness 0.32 + vignette), dim warm iris
// glow, clean neon glyph sprites slam-landing on the pupil. No ring/particles.
//
// TIMING (DECISION A10 rev3, 2026-06-12): 2400ms total = 4 beats x 600ms —
// '3' @0, '2' @600, '1' @1200, 'GO' @1800 as a FULL OPAQUE BEAT (eye photo +
// GO glyph slam + flash/shockwave, same visual weight as the numerals; the
// old 2400ms transparent GO flash was invisible to CJ). At EXACTLY 2400ms the
// opaque countdown (eye photo, vignette, glows, glyph, stake pill) unmounts
// INSTANTLY — the question beneath is fully visible and answerable from
// 2400.0ms (server COUNTDOWN_MS=2400). A <=150ms residual flash + fading GO
// glyph (transparent, pointerEvents none) ride over the live question at the
// handoff; onDone fires @2550ms. The t0 anchor (onHandoff) fires on the
// 2400ms handoff frame — the moment the question appears — NOT the GO beat
// start.
//
// Full takeover: NO header (CJ confirmed 2026-06-11). Stake pill kept per the
// locked prototype. All dimensions in prototype px (1024x2224) * s.
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, Easing, useWindowDimensions, StatusBar } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { COLORS, FONTS, useScale } from './theme';
import { sfx, hapTap } from './sfx';

const EYE = require('../assets/countdown/eye_base.jpeg');
const EYE_W = 1536, EYE_H = 2752;
const SRC = {
  3: require('../assets/countdown/num_3_clean.png'),
  2: require('../assets/countdown/num_2_clean.png'),
  1: require('../assets/countdown/num_1_clean.png'),
  go: require('../assets/countdown/num_go_clean.png'),
};
// display height at scale 1 (prototype px) + natural aspect (w/h)
const GLYPH = {
  3:  { h: 860, ar: 635 / 858 },
  2:  { h: 850, ar: 608 / 854 },
  1:  { h: 790, ar: 524 / 822 },
  go: { h: 540, ar: 884 / 552 },
};
// eye geometry (prototype px): cover crop zoomed 1.35x about the pupil
const ZOOM = 1.35, PUPIL_X = 507, PUPIL_Y = 1064, IRIS_X = 543, IRIS_Y = 1133;
const SLAM_IN = Easing.bezier(0.34, 1.56, 0.64, 1);   // locked spring
const SHOCK_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const BEAT_MS = 600;                                   // 4 x 600 = 2400 = COUNTDOWN_MS

function Radial({ w, h, cx, cy, rx, ry, stops, opacity = 1 }) {
  const id = useRef('g' + Math.random().toString(36).slice(2)).current;
  // NB: SVG RadialGradient has no rx/ry (web silently ignores them and falls
  // back to a giant default radius) — use r=rx + a gradientTransform squash.
  return (
    <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none" opacity={opacity}>
      <Defs>
        <RadialGradient id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={rx}
          gradientTransform={`translate(0 ${cy - (ry / rx) * cy}) scale(1 ${ry / rx})`}>
          {stops.map(([off, c], i) => <Stop key={i} offset={off} stopColor={c[0]} stopOpacity={c[1]} />)}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
    </Svg>
  );
}

// onHandoff(ts): fires on the first RENDERED frame after the 2400ms handoff
// (rAF after the opaque tree unmounts) — the integration anchors the scoring
// t0 to the frame the question actually APPEARS, not the scheduled timer and
// not the GO beat start (rev3). The scheduled flip stays as the fallback t0.
export default function CountdownScreen({ stakeLabel = '$1.00 · WIN $1.90', onDone, onHandoff, freezeBeat = null }) {
  const s = useScale();
  const { width: W, height: H } = useWindowDimensions();
  const px = PUPIL_X * s, py = PUPIL_Y * s, ix = IRIS_X * s, iy = IRIS_Y * s;
  const cx = W / 2, cy = H / 2;

  // two alternating glyph wraps so an exit can overlap the next entry
  const wraps = useRef([0, 1].map(() => ({
    scale: new Animated.Value(0), opacity: new Animated.Value(0), beat: new Animated.Value(3),
  }))).current;
  const wrapBeat = useRef([3, 3]);              // which sprite each wrap shows (state-light)
  const [, force] = React.useReducer((x) => x + 1, 0);
  const shake = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pulse = useRef(new Animated.Value(0)).current;   // iris pulse
  const flash = useRef(new Animated.Value(0)).current;
  const shockS = useRef(new Animated.Value(0.2)).current;
  const shockO = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current; // brightness overlay 0..1
  const [goPhase, setGoPhase] = React.useState(false);   // >=2400ms: transparent GO burst over the live question
  const goScale = useRef(new Animated.Value(3)).current;
  const goOp = useRef(new Animated.Value(0)).current;
  const cur = useRef(0);
  const timers = useRef([]);
  const goRaf = useRef(null);

  const landFX = useCallback((isGo) => {
    // 2px / 90ms micro-shake
    const j = (x, y) => Animated.timing(shake, { toValue: { x: x * s * 2, y: y * s * 2 }, duration: 15, useNativeDriver: true });
    Animated.sequence([j(1, -1), j(-1, 1), j(1, 0.5), j(-0.5, -1), j(0.5, 0.5), j(0, 0)]).start();
    // iris glow pulse +15%, 220ms
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.15, duration: 66, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 154, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    if (isGo) {
      // 120ms flash @15%
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.15, duration: 42, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 78, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      // single thin shockwave 0.2 -> scale 3.4 over 450ms (fits the 600ms beat)
      shockS.setValue(0.2); shockO.setValue(0.2);
      Animated.parallel([
        Animated.timing(shockS, { toValue: 3.4, duration: 450, easing: SHOCK_EASE, useNativeDriver: true }),
        Animated.timing(shockO, { toValue: 0, duration: 450, easing: SHOCK_EASE, useNativeDriver: true }),
      ]).start();
    }
  }, [s]);

  const beat = useCallback((b) => {
    // Phase 6 sound/haptic beats: low tom + medium tap on 3/2/1, whipcrack +
    // heavy on the GO beat. Gated by the Sound toggle inside sfx(); haptics
    // are native-only no-ops on web. Never fires in freezeBeat previews
    // (beat() isn't called there).
    if (b === 'go') { sfx('go'); hapTap('heavy'); }
    else { sfx('countdown_beat'); hapTap('medium'); }
    const prev = wraps[cur.current];
    cur.current = 1 - cur.current;
    const next = wraps[cur.current];
    wrapBeat.current[cur.current] = b; force();
    // slam-in: scale 2.6 (GO: 3 -> 1.15) over 150ms — same locked spring,
    // tightened from 180ms for the 600ms beats (rev3)
    next.scale.setValue(b === 'go' ? 3 : 2.6); next.opacity.setValue(0);
    Animated.parallel([
      Animated.timing(next.scale, { toValue: b === 'go' ? 1.15 : 1, duration: 150, easing: SLAM_IN, useNativeDriver: true }),
      Animated.timing(next.opacity, { toValue: 1, duration: 150, easing: SLAM_IN, useNativeDriver: true }),
    ]).start();
    // slam-out previous: collapse to 0.7 over 130ms
    Animated.parallel([
      Animated.timing(prev.scale, { toValue: 0.7, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(prev.opacity, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    timers.current.push(setTimeout(() => landFX(b === 'go'), 150));
  }, [landFX]);

  useEffect(() => {
    if (freezeBeat != null) {   // deterministic hold (preview / pixel-diff)
      if (freezeBeat === 'go') { // OPAQUE GO beat held mid-flash (rev3)
        wrapBeat.current[0] = 'go'; force();
        wraps[0].opacity.setValue(1);
        wraps[0].scale.setValue(1.15);
        breathe.setValue(0.15);
        flash.setValue(0.15); shockS.setValue(1.6); shockO.setValue(0.12);
        return;
      }
      wrapBeat.current[0] = Number(freezeBeat); force();
      wraps[0].opacity.setValue(1);
      wraps[0].scale.setValue(1);
      breathe.setValue(0.15);
      return;
    }
    // idle breathing glow on whichever glyph is up
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 0.15, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    // 3 @0 · 2 @600 · 1 @1200 · GO (opaque beat) @1800 · handoff @2400
    // (opaque tree unmounts in ONE frame, question live, <=150ms residual
    // flash) · onDone @2550
    beat(3);
    timers.current.push(setTimeout(() => beat(2), BEAT_MS));
    timers.current.push(setTimeout(() => beat(1), BEAT_MS * 2));
    timers.current.push(setTimeout(() => beat('go'), BEAT_MS * 3));
    timers.current.push(setTimeout(() => {
      // 2400ms HANDOFF: the render swaps to the transparent residual — eye/
      // background/glyph/pill unmount THIS frame, question beneath is live
      // immediately. Residual = quick lime flash + the GO glyph fading out in
      // place (<=150ms, pointerEvents none).
      setGoPhase(true);
      goScale.setValue(1.15); goOp.setValue(0.9);
      Animated.timing(goOp, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      flash.setValue(0.12);
      Animated.timing(flash, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      // t0 anchor: first frame where the question is visible
      goRaf.current = requestAnimationFrame(() => { if (onHandoff) onHandoff(Date.now()); });
    }, BEAT_MS * 4));
    timers.current.push(setTimeout(() => onDone && onDone(), 2550));
    return () => { timers.current.forEach(clearTimeout); if (goRaf.current) cancelAnimationFrame(goRaf.current); };
  }, []);

  const glyphWrap = (i) => {
    const g = GLYPH[wrapBeat.current[i]];
    const gh = g.h * s, gw = gh * g.ar;
    return (
      <Animated.View key={i} pointerEvents="none" style={{
        position: 'absolute', left: px - gw / 2, top: py - gh / 2, width: gw, height: gh,
        zIndex: 12, opacity: wraps[i].opacity, transform: [{ scale: wraps[i].scale }] }}>
        <Animated.Image source={SRC[wrapBeat.current[i]]} fadeDuration={0} style={{ width: gw, height: gh }} />
        {/* breathing glow ~ brightness 1.15: additive second copy */}
        <Animated.Image source={SRC[wrapBeat.current[i]]} fadeDuration={0}
          style={{ position: 'absolute', top: 0, left: 0, width: gw, height: gh, opacity: breathe }} />
      </Animated.View>
    );
  };

  if (goPhase) {
    // <=150ms transient residual over the already-visible question —
    // TRANSPARENT and pointerEvents none, so answer taps land from 2400.0ms
    const gg = GLYPH.go, gh = gg.h * s, gw = gh * gg.ar;
    return (
      <View pointerEvents="none" style={{ flex: 1, backgroundColor: 'transparent', overflow: 'hidden' }}>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: flash }}>
          <Radial w={W} h={H} cx={px} cy={py} rx={W * 0.9} ry={W * 0.9} stops={[
            [0, [COLORS.fuseCore, 0.9]], [0.12, [COLORS.lime, 0.5]], [0.32, [COLORS.lime, 0.16]], [0.6, [COLORS.lime, 0]]]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: px - gw / 2, top: py - gh / 2, width: gw, height: gh,
          opacity: goOp, transform: [{ scale: goScale }] }}>
          <Animated.Image source={SRC.go} fadeDuration={0} style={{ width: gw, height: gh }} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={{ flex: 1, transform: [{ translateX: shake.x }, { translateY: shake.y }] }}>
        {/* eye photo: cover crop, zoomed 1.35x about the pupil, brightness 0.32 */}
        <View style={{ position: 'absolute', inset: 0, transform: [
          { translateX: (px - cx) * (1 - ZOOM) }, { translateY: (py - cy) * (1 - ZOOM) }, { scale: ZOOM }] }}>
          {(() => {
            const k = Math.max(W / EYE_W, H / EYE_H);
            return <Animated.Image source={EYE} fadeDuration={0} style={{
              position: 'absolute', top: (H - EYE_H * k) / 2, left: (W - EYE_W * k) / 2,
              width: EYE_W * k, height: EYE_H * k, opacity: 0.62 }} />;
          })()}
        </View>
        {/* vignette (120% x 75% radial at pupil) */}
        <Radial w={W} h={H} cx={px} cy={py} rx={W * 1.2} ry={H * 0.75} stops={[
          [0.3, ['#000', 0]], [0.62, ['#000', 0.35]], [1, ['#000', 0.78]]]} />
        {/* dim warm iris glow — CSS used screen blend; alpha overlay needs ~1.8x
            the stop opacities to read the same over the near-black plate */}
        <Radial w={W} h={H} cx={ix} cy={iy} rx={460 * s} ry={405 * s} stops={[
          [0, ['#FFAA3C', 0.4]], [0.55, ['#FF8C28', 0.18]], [0.75, ['#FF8C28', 0]]]} />
        {/* iris pulse on land */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: pulse, zIndex: 6 }}>
          <Radial w={W} h={H} cx={ix} cy={iy} rx={500 * s} ry={440 * s} stops={[
            [0, ['#FFBE5A', 0.6]], [0.5, ['#FFA032', 0.3]], [0.75, ['#FFA032', 0]]]} />
        </Animated.View>
        {/* static dark pupil disk: clean black backdrop for the glyph */}
        <Radial w={W} h={H} cx={px} cy={py} rx={196 * s} ry={188 * s} stops={[
          [0, ['#050603', 1]], [0.5, ['#050603', 0.95]], [0.72, ['#050603', 0.6]], [1, ['#050603', 0]]]} />
        {/* GO flash */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: flash, zIndex: 7 }}>
          <Radial w={W} h={H} cx={px} cy={py} rx={W * 0.9} ry={W * 0.9} stops={[
            [0, [COLORS.fuseCore, 0.9]], [0.12, [COLORS.lime, 0.5]], [0.32, [COLORS.lime, 0.16]], [0.6, [COLORS.lime, 0]]]} />
        </Animated.View>
        {/* shockwave ring */}
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: px - 210 * s, top: py - 210 * s, width: 420 * s, height: 420 * s,
          borderRadius: 210 * s, borderWidth: 3 * s, borderColor: COLORS.lime, zIndex: 7,
          shadowColor: COLORS.lime, shadowOffset: { width: 0, height: 0 }, shadowRadius: 18 * s, shadowOpacity: 0.45,
          opacity: shockO, transform: [{ scale: shockS }] }} />
        {/* glyphs */}
        {glyphWrap(0)}
        {glyphWrap(1)}
        {/* stake pill (locked prototype chrome) */}
        <View style={{ position: 'absolute', top: 118 * s, left: 0, right: 0, alignItems: 'center', zIndex: 30 }}>
          <View style={{ backgroundColor: 'rgba(16,20,13,0.78)', borderWidth: 1.5 * s,
            borderColor: COLORS.stakeBorder, borderRadius: 44 * s, paddingVertical: 16 * s, paddingHorizontal: 52 * s }}>
            <Text style={{ color: COLORS.lime, fontFamily: FONTS.interExtra, fontSize: 38 * s,
              letterSpacing: 0.05 * 38 * s }}>{stakeLabel}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
