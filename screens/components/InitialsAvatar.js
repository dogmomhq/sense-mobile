// ── Initials avatar (DECISIONS 2026-06-11 #6 / Q1 CONFIRMED) ────────────────
// Deterministic, zero-backend avatar: first two alphanumeric characters of
// the handle inside a lime-ring circle on dark glass. Used in the header,
// profile hero and leaderboard rows wherever `avatarUrl` is absent.
// `avatarUrl` stays reserved in payload shapes for a future upload feature.
import React from 'react';
import { View, Text } from 'react-native';
import { COLORS, FONTS, useScale } from '../theme';

export function initialsFor(handle = '') {
  const chars = String(handle).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (chars.slice(0, 2) || '??');
}

// `size` / `ring` / `fontSize` are PROTOTYPE px (scaled by s like everything).
export default function InitialsAvatar({ handle = '', size = 144, ring = 3, fontSize = null, style }) {
  const s = useScale();
  const fs = (fontSize != null ? fontSize : size * 0.38);
  return (
    <View style={[{ width: size * s, height: size * s, borderRadius: (size / 2) * s,
      backgroundColor: 'rgba(27,32,22,0.95)', borderWidth: ring * s, borderColor: COLORS.lime,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 },
      shadowRadius: 12 * s, shadowOpacity: 1 }, style]}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: fs * s, lineHeight: fs * 1.15 * s,
        color: COLORS.lime, letterSpacing: 0.02 * fs * s, includeFontPadding: false }}>
        {initialsFor(handle)}
      </Text>
    </View>
  );
}
