// ── RANK LADDER UI (RANK-SYSTEM.md, 2026-08-26) ─────────────────────────────
// All rank visuals in one file: tier metadata, badge, home chip, profile hero
// card, results RP strip + full RANK UP celebration. Server is the only source
// of numbers (GET /api/rank via App.js fetchRank); everything here is pure
// presentation. Emoji placeholders render until the AI badge set ships — swap
// BADGE_URLS entries and the art appears everywhere (pure OTA, no reflow).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';
import { COLORS, FONTS, useScale } from './theme';
import { sfx, hapTap } from './sfx';

// n/name mirror the server's TIER_NAMES (lib/rank.js) — names come from the
// snapshot at runtime; these are the offline fallback + art slots.
export const RANK_TIERS = [
  { n: 1,  name: 'Shrimp',      emoji: '🦐' }, { n: 2,  name: 'Squirrel',    emoji: '🐿️' },
  { n: 3,  name: 'Crab',        emoji: '🦀' }, { n: 4,  name: 'Frog',        emoji: '🐸' },
  { n: 5,  name: 'Turtle',      emoji: '🐢' }, { n: 6,  name: 'Deer',        emoji: '🦌' },
  { n: 7,  name: 'Otter',       emoji: '🦦' }, { n: 8,  name: 'Snake',       emoji: '🐍' },
  { n: 9,  name: 'Stingray',    emoji: '🐟' }, { n: 10, name: 'Boar',        emoji: '🐗' },
  { n: 11, name: 'Badger',      emoji: '🦡' }, { n: 12, name: 'Octopus',     emoji: '🐙' },
  { n: 13, name: 'Hyena',       emoji: '🐆' }, { n: 14, name: 'Wolf',        emoji: '🐺' },
  { n: 15, name: 'Shark',       emoji: '🦈' }, { n: 16, name: 'Panther',     emoji: '🐈‍⬛' },
  { n: 17, name: 'Orca',        emoji: '🐳' }, { n: 18, name: 'Great White', emoji: '🦈' },
  { n: 19, name: 'Bear',        emoji: '🐻' }, { n: 20, name: 'Lion',        emoji: '🦁' },
];
// BADGE_URLS[tier-1] = hosted badge image; null → emoji placeholder. Fill when the art ships.
export const BADGE_URLS = new Array(20).fill(null);
// ring metal per block: 1-4 stone, 5-9 bronze, 10-14 silver, 15-19 gold, 20 lion lime
export function ringColor(n) {
  return n >= 20 ? COLORS.lime : n >= 15 ? '#FFD447' : n >= 10 ? '#C9CFD6' : n >= 5 ? '#D08A4E' : '#8A96A3';
}
const tierMeta = (n) => RANK_TIERS[Math.max(1, Math.min(20, n)) - 1];

export function RankBadge({ tier = 1, size = 120, s = 1 }) {
  const m = tierMeta(tier); const d = size * s;
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, borderWidth: Math.max(2, d * 0.045),
      borderColor: ringColor(tier), backgroundColor: 'rgba(16,20,13,0.9)',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: ringColor(tier), shadowOffset: { width: 0, height: 0 },
      shadowRadius: d * 0.18, shadowOpacity: 0.55 }}>
      <Text style={{ fontSize: d * 0.52, lineHeight: d * 0.66 }}>{m.emoji}</Text>
    </View>);
}

// Home chip — always-visible rank presence, sits under the glass header on the left.
export function RankChip({ rank, onPress }) {
  const s = useScale();
  if (!rank || !rank.enabled) return null;
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', top: 300 * s, left: 46 * s, zIndex: 20,
      flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,20,13,0.72)',
      borderWidth: 1.5 * s, borderColor: ringColor(rank.tier), borderRadius: 40 * s,
      paddingVertical: 10 * s, paddingLeft: 12 * s, paddingRight: 28 * s, gap: 14 * s }}>
      <RankBadge tier={rank.tier} size={72} s={s} />
      <View>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream,
          letterSpacing: 0.06 * 30 * s, includeFontPadding: false }}>{String(rank.tierName || tierMeta(rank.tier).name).toUpperCase()}</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 20 * s, color: COLORS.creamDim,
          letterSpacing: 0.08 * 20 * s, includeFontPadding: false }}>
          {rank.nextEntry != null ? `${rank.rp} / ${rank.nextEntry} RP` : `${rank.rp} RP · TOP OF THE FOOD CHAIN`}</Text>
      </View>
    </Pressable>);
}

function ProgressBar({ frac, color, s, h = 18 }) {
  return (
    <View style={{ alignSelf: 'stretch', height: h * s, borderRadius: h * s / 2,
      backgroundColor: 'rgba(245,241,230,0.12)', overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`, height: '100%',
        borderRadius: h * s / 2, backgroundColor: color }} />
    </View>);
}

// Profile hero card — the ladder's home. Renders above the stats card.
export function RankCard({ rank }) {
  const s = useScale();
  if (!rank || !rank.enabled) return null;
  const span = rank.nextEntry != null ? rank.nextEntry - rank.tierEntry : 1;
  const frac = rank.nextEntry != null ? (rank.rp - rank.tierEntry) / Math.max(1, span) : 1;
  const next = rank.tier < 20 ? tierMeta(rank.tier + 1) : null;
  return (
    <View style={{ backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s,
      borderColor: ringColor(rank.tier), borderRadius: 26 * s, padding: 34 * s,
      marginBottom: 28 * s, alignItems: 'center' }}>
      <RankBadge tier={rank.tier} size={210} s={s} />
      <Text style={{ fontFamily: FONTS.anton, fontSize: 76 * s, color: COLORS.cream,
        includeFontPadding: false, marginTop: 20 * s }}>{String(rank.tierName || tierMeta(rank.tier).name).toUpperCase()}</Text>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim,
        letterSpacing: 0.1 * 26 * s, marginTop: 6 * s, marginBottom: 26 * s }}>
        RANK {rank.tier} OF 20{rank.streak >= 2 ? ` · ${rank.streak} WIN STREAK 🔥` : ''}</Text>
      <ProgressBar frac={frac} color={ringColor(rank.tier)} s={s} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 12 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim }}>{rank.rp} RP</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim }}>
          {next ? `${next.emoji} ${String(next.name).toUpperCase()} AT ${rank.nextEntry}` : 'MAX RANK'}</Text>
      </View>
      {rank.floorRp > 0 ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, color: COLORS.creamDim,
          opacity: 0.8, marginTop: 10 * s, letterSpacing: 0.06 * 22 * s }}>
          🛡️ CHECKPOINT — YOU CAN'T DROP BELOW {rank.floorRp} RP</Text>
      ) : null}
    </View>);
}

// Results strip — "+25 RP" counts up under the stake pill once the dust settles.
// `visible` is the ResultsScreen btnIn Animated value so it lands WITH the buttons.
export function RankResultStrip({ rank, visible }) {
  const s = useScale();
  const [shown, setShown] = useState(0);
  const target = rank && rank.enabled && rank.lastDelta != null ? rank.lastDelta : null;
  useEffect(() => {
    if (target == null) return;
    let i = 0; const n = 14;
    const iv = setInterval(() => { i++; setShown(Math.round(target * (1 - Math.pow(1 - i / n, 3)))); if (i >= n) clearInterval(iv); }, 40);
    return () => clearInterval(iv);
  }, [target]);
  if (target == null) return null;
  const up = target >= 0;
  return (
    <Animated.View style={{ alignItems: 'center', marginTop: 14 * s, opacity: visible || 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * s,
        backgroundColor: 'rgba(16,20,13,0.72)', borderWidth: 1.5 * s,
        borderColor: up ? 'rgba(215,248,74,0.5)' : 'rgba(255,90,72,0.5)', borderRadius: 34 * s,
        paddingVertical: 10 * s, paddingHorizontal: 30 * s }}>
        <RankBadge tier={rank.tier} size={52} s={s} />
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 34 * s,
          color: up ? COLORS.lime : '#FF5A48', includeFontPadding: false }}>
          {up ? '+' : ''}{shown} RP</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim,
          letterSpacing: 0.06 * 24 * s, includeFontPadding: false }}>
          {String(rank.tierName || '').toUpperCase()}{rank.streak >= 2 ? ` · ${rank.streak}🔥` : ''}</Text>
      </View>
    </Animated.View>);
}

// Full-screen RANK UP celebration — the dopamine peak, fired at the play-again
// decision point. Badge slams in (scale 3→1 backOut), glow ring pulses, lime
// flash, win sound + heavy haptic. Tap anywhere to dismiss.
export function RankUpOverlay({ rank, onDone }) {
  const s = useScale();
  const a = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    try { sfx('win'); } catch (e) {}
    try { hapTap('heavy'); } catch (e) {}
    Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, []);
  if (!rank || !rank.enabled) return null;
  const m = tierMeta(rank.tier);
  return (
    <Pressable onPress={onDone} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 80, backgroundColor: 'rgba(6,8,5,0.88)', alignItems: 'center', justifyContent: 'center' }}>
      {/* flash */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: COLORS.lime, opacity: a.interpolate({ inputRange: [0, 0.12, 0.4, 1], outputRange: [0, 0.55, 0, 0] }) }} />
      {/* pulsing glow ring */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 560 * s, height: 560 * s,
        borderRadius: 280 * s, borderWidth: 5 * s, borderColor: ringColor(rank.tier),
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }} />
      <Animated.View style={{ alignItems: 'center',
        opacity: a.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [3, 1] }) }] }}>
        <RankBadge tier={rank.tier} size={340} s={s} />
        <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: COLORS.lime,
          letterSpacing: 0.14 * 64 * s, marginTop: 44 * s, includeFontPadding: false }}>RANK UP</Text>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 130 * s, color: COLORS.cream,
          includeFontPadding: false, marginTop: 6 * s }}>{String(rank.tierName || m.name).toUpperCase()}</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.creamDim,
          letterSpacing: 0.1 * 30 * s, marginTop: 16 * s }}>RANK {rank.tier} OF 20 · {rank.rp} RP</Text>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 120 * s, fontFamily: FONTS.interBold,
        fontSize: 26 * s, color: COLORS.creamDim, letterSpacing: 0.1 * 26 * s }}>TAP TO CONTINUE</Text>
    </Pressable>);
}
