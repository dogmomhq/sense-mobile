// ── HOME (1:1 port of sense_ui_proto/index.html, locked v56) ───────────────
// All numbers are prototype px on the 1024x2224 canvas, scaled by s.
// Percent bands (photo / fades) stay percentages of the real screen height,
// exactly like the CSS, so other aspect ratios degrade gracefully.
import React from 'react';
import { View, Text, Pressable, useWindowDimensions, StatusBar } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import SegmentedNav from './components/SegmentedNav';
import CoverPhoto from './components/CoverPhoto';
import { COLORS, FONTS, RADII, useScale } from './theme';

const CHEETAH = require('../assets/cheetah.jpeg');
const CHEETAH_W = 768, CHEETAH_H = 1376;
const TIERS = ['$0.50', '$1.00', '$5.00', '$10.00'];

export default function HomeScreen({
  streak = 8, balance = '$24.50', tiers = TIERS, selectedTier = 1, winAmount = 'WIN $1.90',
  onPlay, onPractice, onSelectTier, onTab, activeTab = 'home', showClock = false,
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />

      {/* cheetah photo — CSS: top -120px, height calc(65% + 120px), center top / cover */}
      <CoverPhoto source={CHEETAH} naturalW={CHEETAH_W} naturalH={CHEETAH_H}
        boxW={width} boxH={height * 0.65 + 120 * s}
        style={{ position: 'absolute', top: -120 * s, left: 0, zIndex: 1 }} />

      {/* olive top fade (status-bar legibility band, v51 curve) */}
      <LinearGradient pointerEvents="none"
        colors={['rgba(30,34,26,0.93)', 'rgba(30,34,26,0.91)', 'rgba(30,34,26,0.55)', 'rgba(30,34,26,0.25)', 'rgba(30,34,26,0.08)', 'rgba(30,34,26,0)']}
        locations={[0, 0.5, 0.64, 0.78, 0.9, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.2, zIndex: 2 }} />

      {/* bottom fade to forest black (v50 curve) */}
      <LinearGradient pointerEvents="none"
        colors={['rgba(11,15,10,0)', 'rgba(11,15,10,0.32)', 'rgba(11,15,10,0.64)', 'rgba(11,15,10,0.82)', 'rgba(11,15,10,1)', 'rgba(11,15,10,1)']}
        locations={[0, 0.2, 0.4, 0.65, 0.88, 1]}
        style={{ position: 'absolute', top: height * 0.35, left: 0, right: 0, height: height * 0.7, zIndex: 2 }} />

      <GlassHeader streak={streak} balance={balance} showClock={showClock} />

      {/* wordmark + tagline */}
      <View style={{ position: 'absolute', top: 1150 * s, left: 0, right: 0,
        alignItems: 'center', paddingHorizontal: 32 * s, zIndex: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 340 * s, lineHeight: 0.86 * 340 * s,
          color: COLORS.wordmark, letterSpacing: -0.045 * 340 * s, marginBottom: 16 * s,
          textShadowColor: 'rgba(0,0,0,0.78)', textShadowOffset: { width: 0, height: 8 * s }, textShadowRadius: 36 * s,
          includeFontPadding: false }}>SENSE</Text>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.lime,
          letterSpacing: 0.22 * 32 * s,
          textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 * s }, textShadowRadius: 8 * s }}>
          WILDLIFE. INSTINCT. VICTORY.</Text>
      </View>

      {/* CTA stack — PLAY NOW (lime, h~170) + PRACTICE FREE (ghost, h~110) */}
      <View style={{ position: 'absolute', top: 1500 * s, left: 45 * s, right: 45 * s, gap: 16 * s, zIndex: 15 }}>
        <Pressable onPress={onPlay}
          style={({ pressed }) => ({ backgroundColor: COLORS.lime, borderRadius: RADII.cta * s,
            paddingVertical: 50 * s, paddingHorizontal: 48 * s,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 * s,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s, shadowOpacity: 0.55,
            elevation: 10, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 72 * s, lineHeight: 86 * s, color: '#000',
            letterSpacing: -0.01 * 72 * s, transform: [{ scaleY: 1.22 }], includeFontPadding: false, top: 3 * s }}>PLAY NOW</Text>
          <Svg width={60 * s} height={66 * s} viewBox="0 0 24 24" preserveAspectRatio="none">
            <Path d="M13 2 L4 14 H11 L10 22 L19 10 H12 L13 2 Z" fill="#000" />
          </Svg>
        </Pressable>
        <Pressable onPress={onPractice}
          style={({ pressed }) => ({ borderWidth: 3 * s, borderColor: COLORS.ghostBorder,
            borderRadius: RADII.ghost * s, paddingVertical: 32 * s, paddingHorizontal: 48 * s,
            alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 38 * s, color: COLORS.cream,
            letterSpacing: 0.16 * 38 * s, top: 5 * s }}>PRACTICE FREE</Text>
        </Pressable>
      </View>

      {/* tier caption row (y1845) */}
      <View style={{ position: 'absolute', top: 1845 * s, left: 32 * s, right: 32 * s,
        flexDirection: 'row', justifyContent: 'space-between', zIndex: 15 }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, letterSpacing: 0.08 * 30 * s,
          color: COLORS.creamDim }}>SELECT YOUR TIER</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, letterSpacing: 0.08 * 30 * s,
          color: COLORS.lime }}>{winAmount}</Text>
      </View>

      {/* tier pills (y1895, selected cell 1.09x wider) */}
      <View style={{ position: 'absolute', top: 1895 * s, left: 43 * s, right: 48 * s,
        flexDirection: 'row', gap: 16 * s, zIndex: 15 }}>
        {tiers.map((t, i) => {
          const sel = i === selectedTier;
          return (
            <Pressable key={t} onPress={() => onSelectTier && onSelectTier(i)}
              style={{ flex: sel ? 1.09 : 1,
                backgroundColor: sel ? COLORS.lime : COLORS.tierBg,
                borderWidth: 1.5 * s, borderColor: sel ? COLORS.lime : COLORS.tierBorder,
                borderRadius: RADII.tier * s, paddingVertical: 36 * s, paddingHorizontal: 12 * s,
                alignItems: 'center',
                ...(sel ? { shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 16 * s, shadowOpacity: 1 } : null) }}>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.interExtra, fontSize: 48 * s, lineHeight: 57 * s,
                letterSpacing: -0.01 * 48 * s, color: sel ? '#000' : COLORS.cream, top: 1 * s }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <SegmentedNav active={activeTab} onTab={onTab} />
    </View>
  );
}
