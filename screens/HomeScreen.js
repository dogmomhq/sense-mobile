// ── HOME (1:1 port of sense_ui_proto/index.html, locked v56) ───────────────
// All numbers are prototype px on the 1024x2224 canvas, scaled by s.
// Percent bands (photo / fades) stay percentages of the real screen height,
// exactly like the CSS, so other aspect ratios degrade gracefully.
import React from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, StatusBar } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import SegmentedNav from './components/SegmentedNav';
import CoverPhoto from './components/CoverPhoto';
import { PendingStrip } from './AppShell';
import { COLORS, FONTS, RADII, useScale, useVScale } from './theme';

const CHEETAH = require('../assets/cheetah.jpeg');
const CHEETAH_W = 768, CHEETAH_H = 1376;
// default ladder (offline fallback — ReskinApp passes the live server ladder).
// Phase 2 (2026-07-16): 9 fixed-prize tiers; locked ones render greyed "SOON".
const TIERS = [
  { label: '$0.50', locked: false }, { label: '$1.00', locked: false },
  { label: '$2.00', locked: false }, { label: '$4.00', locked: false },
  { label: '$8.00', locked: false }, { label: '$16.00', locked: true },
  { label: '$32.00', locked: true }, { label: '$64.00', locked: true },
  { label: '$128.00', locked: true },
];
// OTA build stamp — bump on every OTA so CJ can confirm a bundle actually landed.
export const BUILD_TAG = 'B78';

export default function HomeScreen({
  streak = 8, balance = '$24.50', tiers = TIERS, selectedTier = 1, winAmount = 'WIN $1.90',
  onPlay, onPractice, onSelectTier, onTab, activeTab = 'home', showClock = false,
  // live wiring (ReskinApp): identity header, pending strip, insufficient-balance state
  handle = null, signedIn = true, onSignIn, onAddFunds, avatar,
  pendingCount = 0, onPendingPress,
  playDisabled = false, insufficientLabel = 'NOT ENOUGH BALANCE',
}) {
  const s = useScale();
  const { width, height } = useWindowDimensions();
  // Height-aware vertical anchors (see theme.useVScale): nav is bottom-anchored,
  // tier row / caption / CTA stack stack upward from it with gaps that compress
  // (factor g) on short viewports; the wordmark clamps above the CTAs and the
  // photo area absorbs the remaining shrink. On the 1024x2224 canvas (g=1,
  // safeB=0) these resolve to the exact locked design-Y values (1500/1845/1895).
  const { g, safeB } = useVScale();
  const navB = 4 * s + safeB;                       // SegmentedNav bottom edge
  const pillsB = navB + (140 + 53 * g) * s;         // tier pills (design h132)
  const captionB = pillsB + (132 + 14 * g) * s;     // caption row (design h36)
  const ctaB = captionB + (36 + 33 * g) * s;        // CTA stack (design h312)
  const wmTop = Math.min(1150 * s, height - ctaB - (312 + 350) * s);

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

      <GlassHeader streak={streak} balance={balance} handle={handle} signedIn={signedIn}
        {...(avatar ? { avatar } : {})}
        onSignIn={onSignIn} onPressAdd={onAddFunds} showClock={showClock} />
      {pendingCount > 0 ? <PendingStrip count={pendingCount} onPress={onPendingPress} /> : null}

      {/* wordmark + tagline (clamps upward on short viewports) */}
      <View style={{ position: 'absolute', top: wmTop, left: 0, right: 0,
        alignItems: 'center', paddingHorizontal: 32 * s, zIndex: 10 }}>
        {/* iOS rasterizes Anton's glyph box at its NATURAL ascent/descent; any
            lineHeight below ~1.3em clamps that box and slices the S/E tops & bottoms.
            Fix: lineHeight 1.32em gives the glyph headroom, and the wrapper is
            sized to fontSize*1.36 (taller than the line box) with center justify so
            the wordmark is anchored by the CONTAINER, never by a tight text box. */}
        <View style={{ height: 1.36 * 340 * s, marginBottom: 16 * s, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 340 * s, lineHeight: 1.32 * 340 * s,
            color: COLORS.wordmark, letterSpacing: -0.045 * 340 * s,
            textShadowColor: 'rgba(0,0,0,0.78)', textShadowOffset: { width: 0, height: 8 * s }, textShadowRadius: 36 * s,
            includeFontPadding: false }}>SENSE</Text>
        </View>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.lime,
          letterSpacing: 0.22 * 32 * s,
          textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 * s }, textShadowRadius: 8 * s }}>
          WILDLIFE. INSTINCT. VICTORY.</Text>
      </View>

      {/* CTA stack — PLAY NOW (lime, h~170) + PRACTICE FREE (ghost, h~110) */}
      <View style={{ position: 'absolute', bottom: ctaB, left: 45 * s, right: 45 * s, gap: 16 * s, zIndex: 15 }}>
        {playDisabled ? (
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: '#FF5A48',
            letterSpacing: 0.08 * 28 * s, textAlign: 'center' }}>{insufficientLabel}</Text>
        ) : null}
        <Pressable onPress={playDisabled ? undefined : onPlay} disabled={playDisabled}
          style={({ pressed }) => ({ backgroundColor: COLORS.lime, borderRadius: RADII.cta * s,
            paddingVertical: 50 * s, paddingHorizontal: 48 * s,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 * s,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s, shadowOpacity: 0.55,
            elevation: 10, opacity: playDisabled ? 0.45 : pressed ? 0.85 : 1 })}>
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
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 38 * s, lineHeight: 40 * s, color: COLORS.cream,
            letterSpacing: 0.16 * 38 * s, top: 5 * s, includeFontPadding: false }}>PRACTICE FREE</Text>
        </Pressable>
      </View>

      {/* tier caption row (design y1845, bottom-anchored) */}
      <View style={{ position: 'absolute', bottom: captionB, left: 32 * s, right: 32 * s,
        flexDirection: 'row', justifyContent: 'space-between', zIndex: 15 }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, lineHeight: 36 * s, letterSpacing: 0.08 * 30 * s,
          color: COLORS.creamDim, includeFontPadding: false }}>SELECT YOUR TIER</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, lineHeight: 36 * s, letterSpacing: 0.08 * 30 * s,
          color: COLORS.lime, includeFontPadding: false }}>{winAmount}</Text>
      </View>

      {/* tier pills (design y1895, bottom-anchored, selected cell 1.09x wider).
          Phase 2 (2026-07-16): 9 fixed-prize tiers — the row scrolls horizontally,
          pill width locked to the original 4-across geometry (height 129 = old
          36+57+36 paddings+line). Locked tiers render greyed with a SOON tag and
          ignore taps; they light up on next app-open after an admin unlock (no
          OTA). Accepts plain label strings (PreviewApp/legacy) or {label, locked}. */}
      <View style={{ position: 'absolute', bottom: pillsB, left: 43 * s, right: 48 * s, zIndex: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 * s }}>
          {tiers.map((t, i) => {
            const tier = typeof t === 'string' ? { label: t, locked: false } : t;
            const sel = i === selectedTier;
            const pillW = ((width - (43 + 48) * s) - 3 * 16 * s) / 4;
            return (
              <Pressable key={tier.label} disabled={tier.locked}
                onPress={() => !tier.locked && onSelectTier && onSelectTier(i)}
                style={{ width: sel ? pillW * 1.09 : pillW, height: 129 * s,
                  opacity: tier.locked ? 0.4 : 1,
                  backgroundColor: sel ? COLORS.lime : COLORS.tierBg,
                  borderWidth: 1.5 * s, borderColor: sel ? COLORS.lime : COLORS.tierBorder,
                  borderRadius: RADII.tier * s, paddingHorizontal: 12 * s,
                  alignItems: 'center', justifyContent: 'center',
                  ...(sel ? { shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 16 * s, shadowOpacity: 1 } : null) }}>
                <Text numberOfLines={1} style={{ fontFamily: FONTS.interExtra, fontSize: 48 * s, lineHeight: 57 * s,
                  letterSpacing: -0.01 * 48 * s, color: sel ? '#000' : COLORS.cream, top: 1 * s }}>{tier.label}</Text>
                {tier.locked ? (
                  <Text style={{ fontFamily: FONTS.interBold, fontSize: 20 * s, lineHeight: 24 * s,
                    letterSpacing: 0.1 * 20 * s, color: COLORS.cream, opacity: 0.8 }}>SOON</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* OTA build stamp (bottom-right, above nav) — proves which bundle is live */}
      <Text style={{ position: 'absolute', right: 24 * s, bottom: navB + 150 * s, zIndex: 40,
        fontFamily: FONTS.interBold, fontSize: 10, color: COLORS.cream, opacity: 0.3 }}>{`v.${BUILD_TAG}`}</Text>

      <SegmentedNav active={activeTab} onTab={onTab} />
    </View>
  );
}

