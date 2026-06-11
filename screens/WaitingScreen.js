// ── WAITING (DECISIONS 2026-06-11 Q6 FINAL: dedicated waiting screen) ───────
// Full results-style takeover WITH the glass header. Shown after you answer
// while the opponent is still pending (ghost play). Layout per locked mockup
// ui_mockups_v2/batch6/waiting.png:
//   YOU LOCKED (Anton cream) → giant lime time → mystery-eyes chip
//   "AN OPPONENT IS OUT THERE" over subtle radar pulse rings → stake pill →
//   lime PLAY AGAIN (same-tier re-queue, decision #13/Q7) + ghost HISTORY/HOME.
// Pure presentational: no sockets, no timers beyond the radar pulse loop.
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, useWindowDimensions, StatusBar } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import CoverPhoto from './components/CoverPhoto';
import { COLORS, FONTS, RADII, useScale } from './theme';

const PHOTO = require('../assets/cheetah.jpeg');
const PHOTO_W = 768, PHOTO_H = 1376;

// three staggered expanding lime rings centered on the photo's eye line
function RadarPulse({ cx, cy, freeze = false }) {
  const s = useScale();
  const t = useRef(new Animated.Value(freeze ? 0.35 : 0)).current;
  useEffect(() => {
    if (freeze) return;
    const loop = Animated.loop(Animated.timing(t, {
      toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [freeze, t]);
  const rings = [0, 1 / 3, 2 / 3].map((off, i) => {
    const p = Animated.modulo(Animated.add(t, off), 1);
    const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
    const opacity = p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.38, 0] });
    const D = 760 * s;
    return (
      <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute',
        left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: D / 2,
        borderWidth: 2.5 * s, borderColor: COLORS.lime, opacity, transform: [{ scale }] }} />
    );
  });
  return <>{rings}</>;
}

export default function WaitingScreen({
  streak = 8, balance = '$24.50', handle = null, signedIn = true,
  lockedTime = '1.42s', stakeText = '$1.00 · WIN $1.90',
  onPlayAgain, onHistory, onHome, showClock = false, freeze = false,
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();
  const eyesCY = 1190 * s; // radar center, on the eye line of the dimmed photo

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest, overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />

      {/* dimmed photo band behind the radar zone */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.78,
        opacity: 0.34, zIndex: 1 }}>
        <CoverPhoto source={PHOTO} naturalW={PHOTO_W} naturalH={PHOTO_H}
          boxW={width} boxH={height * 0.78} />
      </View>
      <LinearGradient pointerEvents="none"
        colors={['rgba(11,15,10,0.92)', 'rgba(11,15,10,0.55)', 'rgba(11,15,10,0.35)', 'rgba(11,15,10,0.75)', 'rgba(11,15,10,1)']}
        locations={[0, 0.22, 0.5, 0.72, 0.88]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 }} />

      <GlassHeader streak={streak} balance={balance} handle={handle}
        signedIn={signedIn} showClock={showClock} />

      {/* YOU LOCKED + giant lime time */}
      <View style={{ position: 'absolute', top: 330 * s, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 170 * s, lineHeight: 184 * s,
          color: COLORS.cream, letterSpacing: -0.01 * 170 * s, includeFontPadding: false,
          textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 6 * s },
          textShadowRadius: 24 * s }}>YOU LOCKED</Text>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 200 * s, lineHeight: 230 * s,
          color: COLORS.lime, letterSpacing: 0.02 * 200 * s, includeFontPadding: false,
          textShadowColor: COLORS.limeGlow, textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 38 * s }}>{lockedTime}</Text>
      </View>

      {/* radar pulse rings around the mystery eyes */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0,
        bottom: 0, zIndex: 5 }}>
        <RadarPulse cx={width / 2} cy={eyesCY} freeze={freeze} />
      </View>

      {/* mystery-opponent chip (#7: pre-reveal treatment, opponent unknown) */}
      <View style={{ position: 'absolute', top: 940 * s, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <View style={{ backgroundColor: 'rgba(16,20,13,0.72)', borderWidth: 1.5 * s,
          borderColor: 'rgba(245,241,230,0.25)', borderRadius: RADII.stake * s,
          paddingVertical: 18 * s, paddingHorizontal: 42 * s }}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s,
            letterSpacing: 0.1 * 36 * s, color: COLORS.cream }}>AN OPPONENT IS OUT THERE</Text>
        </View>
      </View>

      {/* stake pill */}
      <View style={{ position: 'absolute', top: 1490 * s, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <View style={{ backgroundColor: COLORS.stakeBg, borderWidth: 1.5 * s, borderColor: COLORS.stakeBorder,
          borderRadius: RADII.stake * s, paddingVertical: 14 * s, paddingHorizontal: 44 * s }}>
          <Text style={{ color: COLORS.cream, fontFamily: FONTS.interExtra, fontSize: 34 * s,
            letterSpacing: 0.06 * 34 * s }}>{stakeText}</Text>
        </View>
      </View>

      {/* PLAY AGAIN (same tier, decision #13/Q7 sticky tier) */}
      <Pressable onPress={onPlayAgain} style={{ position: 'absolute', top: 1640 * s, left: 60 * s,
        right: 60 * s, height: 200 * s, borderRadius: RADII.cta * s, backgroundColor: COLORS.lime,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 * s, zIndex: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 72 * s, lineHeight: 86 * s, color: '#000',
          letterSpacing: -0.01 * 72 * s, transform: [{ scaleY: 1.22 }], includeFontPadding: false,
          top: 3 * s }}>PLAY AGAIN</Text>
        <Svg width={56 * s} height={62 * s} viewBox="0 0 24 24" preserveAspectRatio="none">
          <Path d="M13 2 L4 14 H11 L10 22 L19 10 H12 L13 2 Z" fill="#000" />
        </Svg>
      </Pressable>

      {/* ghost HISTORY / HOME row */}
      <View style={{ position: 'absolute', top: 1880 * s, left: 60 * s, right: 60 * s,
        flexDirection: 'row', gap: 24 * s, zIndex: 12 }}>
        {[['HISTORY', onHistory], ['HOME', onHome]].map(([label, fn]) => (
          <Pressable key={label} onPress={fn} style={{ flex: 1, height: 124 * s,
            borderRadius: RADII.ghost * s, borderWidth: 3 * s, borderColor: COLORS.ghostBorder,
            backgroundColor: 'rgba(16,20,13,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 38 * s,
              letterSpacing: 0.16 * 38 * s, color: COLORS.cream }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
