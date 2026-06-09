// ── Laser-fuse timer ring (port of question_ring_demo.html, 'fuse' style) ──
// 840x840 wrap at prototype top 430, ring R=396 around (420,420).
// Time runs 10.0 -> 0.0; the head starts at 12 o'clock and travels clockwise.
//   - pale burnt trail behind the head (the spent fuse)
//   - lime remaining arc with a white-hot core (the laser)
//   - ember + spark_sprite.png sparkler at the head
//   - small centered seconds readout on a dark disc
// Pure render from `secondsLeft` — the screen drives it (rAF for live play).
//
// Glow: the prototype uses SVG feGaussianBlur filters. react-native-svg
// 15.x ships Filter/FeGaussianBlur/FeMerge; if the running version lacks
// them we fall back to layered wide strokes (visually equivalent halo).
import React from 'react';
import { View, Image } from 'react-native';
import * as RNSvg from 'react-native-svg';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS, useScale } from '../theme';

const SPRITE = require('../../assets/spark_sprite.png');
const R = 396, CX = 420, CY = 420;

const HAS_FILTERS = !!(RNSvg.Filter && RNSvg.FeGaussianBlur && RNSvg.FeMerge && RNSvg.FeMergeNode);
const { Filter, FeGaussianBlur, FeMerge, FeMergeNode, Defs } = RNSvg;

function pt(aDeg, r = R) {
  const a = (aDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}
function arcPath(a0, a1) {
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

// stroke + optional glow halo. With filters: blurred copy merged under the
// crisp copy (same as the prototype's #glow / #glowBig). Without: a wider,
// fainter stroke underneath approximates the halo.
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

export default function TimerRing({ secondsLeft = 10 }) {
  const s = useScale();
  const tLeft = Math.max(0, Math.min(10, secondsLeft));
  const headA = ((10 - tLeft) / 10) * 360;      // head angle from top, clockwise
  const [hx, hy] = pt(headA);
  const rot = (headA * 1.7) % 360;              // sparkler spin (prototype law)

  return (
    <View pointerEvents="none"
      style={{ position: 'absolute', top: 430 * s, left: 92 * s, width: 840 * s, height: 840 * s, zIndex: 15 }}>
      <Svg width={840 * s} height={840 * s} viewBox="0 0 840 840" style={{ overflow: 'visible' }}>
        {HAS_FILTERS ? (
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

        {/* burnt trail — smooth pale spent fuse over the elapsed arc */}
        {headA > 0.5 ? (
          <>
            <GlowPath d={arcPath(0, headA)} stroke={COLORS.burntGlow} width={22} glow="small" />
            <Path d={arcPath(0, headA)} stroke={COLORS.burntCore} strokeWidth={12} strokeLinecap="round" fill="none" />
          </>
        ) : null}

        {/* LASER remaining arc: bloom + beam + white-hot core */}
        {headA < 359.5 ? (
          <>
            <GlowPath d={arcPath(headA, 360)} stroke={COLORS.lime} width={30} opacity={0.35} glow="big" />
            <GlowPath d={arcPath(headA, 360)} stroke={COLORS.lime} width={14} opacity={0.95} glow="small" />
            <Path d={arcPath(headA, 360)} stroke={COLORS.fuseCore} strokeWidth={5} strokeLinecap="round" fill="none" />
          </>
        ) : null}

        {/* fuse head ember (sparkler sprite overlays in the HTML layer below) */}
        {HAS_FILTERS
          ? <Circle cx={hx} cy={hy} r={26} fill={COLORS.emberOuter} filter="url(#srGlow)" />
          : <><Circle cx={hx} cy={hy} r={40} fill={COLORS.emberOuter} opacity={0.35} /><Circle cx={hx} cy={hy} r={26} fill={COLORS.emberOuter} /></>}
        <Circle cx={hx} cy={hy} r={13} fill={COLORS.white} />

        {/* centered seconds — small, quiet, always readable */}
        <Circle cx={CX} cy={CY} r={86} fill="rgba(11,15,10,0.55)" />
        <SvgText x={CX} y={CY + 6} textAnchor="middle" alignmentBaseline="central"
          fontFamily={FONTS.mono} fontSize={64} fill={COLORS.lime} opacity={0.95}>
          {tLeft.toFixed(1)}
        </SvgText>
      </Svg>

      {/* sparkler sprite at the fuse head — plain alpha compositing
          (verified to read correctly without blend modes) */}
      <Image source={SPRITE} fadeDuration={0} pointerEvents="none"
        style={{ position: 'absolute', left: (hx - 280) * s, top: (hy - 280) * s,
          width: 560 * s, height: 560 * s, transform: [{ rotate: `${rot}deg` }] }} />
      <Image source={SPRITE} fadeDuration={0} pointerEvents="none"
        style={{ position: 'absolute', left: (hx - 170) * s, top: (hy - 170) * s,
          width: 340 * s, height: 340 * s, opacity: 0.9, transform: [{ rotate: `${-rot * 1.4}deg` }] }} />
    </View>
  );
}
