// ── Glass header (locked v56 geometry) ──────────────────────────────────────
// Glass slab w/ lime border behind three floating elements:
//   avatar 144px (lime ring) · streak chip 180x114 · balance pill 343x114
// Prototype: slab top 94 h168 inset 22 | row top 121 left 46 right 55 h 114.
// `showClock` renders the prototype's mock status bar (preview/pixel-diff
// parity only — real devices draw their own status bar over the photo).
import React from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from '../theme';
import InitialsAvatar from './InitialsAvatar';

const DEFAULT_AVATAR = require('../../assets/avatar_demo.png');

export function StatusBarMock() {
  const s = useScale();
  const bar = (h) => ({ width: 7 * s, height: h * s, backgroundColor: COLORS.cream, borderRadius: 2 * s });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingTop: 34 * s, paddingLeft: 118 * s, paddingRight: 74 * s }}>
      <Text style={{ color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 38 * s }}>9:41</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * s }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 * s }}>
          <View style={bar(10)} /><View style={bar(15)} /><View style={bar(20)} /><View style={bar(25)} />
        </View>
        <Svg width={38 * s} height={28 * s} viewBox="0 0 32 24" fill="none">
          <Path d="M2 9 Q16 -2 30 9" stroke={COLORS.cream} strokeWidth={3} strokeLinecap="round" />
          <Path d="M7 13 Q16 5 25 13" stroke={COLORS.cream} strokeWidth={3} strokeLinecap="round" />
          <Path d="M12 17 Q16 13 20 17" stroke={COLORS.cream} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={16} cy={21} r={1.5} fill={COLORS.cream} />
        </Svg>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 54 * s, height: 26 * s, borderWidth: 2 * s, borderColor: COLORS.cream,
            borderRadius: 6 * s, padding: 2 * s }}>
            <View style={{ flex: 1, backgroundColor: COLORS.cream, borderRadius: 3 * s }} />
          </View>
          <View style={{ width: 4 * s, height: 8 * s, backgroundColor: COLORS.cream, borderRadius: 1 * s, marginLeft: 2 * s }} />
        </View>
      </View>
    </View>
  );
}

function Flame({ s }) {
  return (
    <Svg width={64 * s} height={60 * s} viewBox="0 0 32 38" preserveAspectRatio="none" fill="none">
      <Path d="M16 0 C 22 8, 28 14, 26 22 C 24 32, 18 36, 16 36 C 14 36, 8 32, 6 22 C 4 14, 10 8, 16 0 Z" fill={COLORS.flameOut} />
      <Path d="M16 8 C 19 14, 22 18, 21 24 C 20 30, 17 32, 16 32 C 15 32, 12 30, 11 24 C 10 18, 13 14, 16 8 Z" fill={COLORS.flameIn} />
    </Svg>
  );
}

export function StreakChip({ streak = 8 }) {
  const s = useScale();
  return (
    <View style={{ width: 180 * s, height: 114 * s, backgroundColor: COLORS.chipBg,
      borderWidth: 2.5 * s, borderColor: COLORS.lime, borderRadius: RADII.chip * s,
      alignItems: 'center', justifyContent: 'center', paddingTop: 14 * s, paddingBottom: 4 * s, gap: 2 * s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 * s }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 66 * s, lineHeight: 66 * s,
          color: COLORS.lime, letterSpacing: -0.02 * 66 * s }}>{String(streak)}</Text>
        <Flame s={s} />
      </View>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, lineHeight: 36 * s,
        letterSpacing: 0.08 * 32 * s, color: COLORS.cream }}>STREAK</Text>
    </View>
  );
}

export function BalancePill({ balance = '$24.50', onPressAdd }) {
  const s = useScale();
  return (
    <View style={{ width: 343 * s, height: 114 * s, backgroundColor: COLORS.chipBg,
      borderWidth: 2.5 * s, borderColor: COLORS.lime, borderRadius: RADII.chip * s,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingLeft: 38 * s, paddingRight: 37 * s }}>
      <View>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, lineHeight: 22 * s,
          letterSpacing: 0.12 * 22 * s, color: COLORS.creamDim, marginBottom: 8 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 48 * s, lineHeight: 48 * s,
          letterSpacing: -0.02 * 48 * s, color: COLORS.cream }}>{balance}</Text>
      </View>
      <Pressable onPress={onPressAdd} hitSlop={14}
        style={{ width: 54 * s, height: 54 * s, borderRadius: 27 * s, borderWidth: 3 * s,
          borderColor: COLORS.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.lime, fontFamily: FONTS.interBold, fontSize: 38 * s, lineHeight: 44 * s }}>+</Text>
      </Pressable>
    </View>
  );
}

// Logged-out header (AUTH decision 2026-06-11): avatar slot is replaced by a
// SIGN IN lime pill. Streak chip + balance pill stay (guest balance still real).
function SignInPill({ onPress }) {
  const s = useScale();
  return (
    <Pressable onPress={onPress} style={{ height: 114 * s, borderRadius: RADII.chip * s,
      backgroundColor: COLORS.lime, paddingHorizontal: 38 * s,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 12 * s, shadowOpacity: 1 }}>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: COLORS.forest,
        letterSpacing: 0.08 * 36 * s }}>SIGN IN</Text>
    </Pressable>
  );
}

// `handle` (no `avatar` prop): deterministic initials avatar replaces the
// demo photo — the locked screens that pass an explicit avatar are unchanged.
export default function GlassHeader({ streak = 8, balance = '$24.50', avatar = DEFAULT_AVATAR,
  handle = null, showClock = false, signedIn = true, onSignIn, onPressAdd }) {
  const s = useScale();
  return (
    <>
      {showClock ? <StatusBarMock /> : null}
      {/* glass slab w/ lime line (v56) */}
      <View style={{ position: 'absolute', top: 94 * s, left: 22 * s, right: 22 * s, height: 168 * s,
        backgroundColor: COLORS.glassBg, borderWidth: 1.5 * s, borderColor: COLORS.glassBorder,
        borderRadius: RADII.glass * s, zIndex: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 * s }, shadowRadius: 24 * s, shadowOpacity: 0.45, elevation: 8 }} />
      {/* floating row */}
      <View style={{ position: 'absolute', top: 121 * s, left: 46 * s, right: 55 * s, height: 114 * s,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 21 * s }}>
          {signedIn ? (
            (avatar === DEFAULT_AVATAR && handle) ? (
              <InitialsAvatar handle={handle} size={144} ring={3} style={{ marginTop: -8 * s }} />
            ) : (
            <Image source={avatar} fadeDuration={0}
              style={{ width: 144 * s, height: 144 * s, borderRadius: 72 * s, marginTop: -8 * s,
                borderWidth: 3 * s, borderColor: COLORS.lime,
                shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 12 * s, shadowOpacity: 1 }} />
            )
          ) : (
            <SignInPill onPress={onSignIn} />
          )}
          <StreakChip streak={streak} />
        </View>
        <BalancePill balance={balance} onPressAdd={onPressAdd} />
      </View>
    </>
  );
}
