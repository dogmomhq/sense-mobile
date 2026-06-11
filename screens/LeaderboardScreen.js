// ── LEADERBOARD (DECISIONS 2026-06-11 #18 + Q8) ─────────────────────────────
// Ranked rows: rank chip · initials avatar (lime ring) · name · W-L-D record
// · win%. NO net-$/profit column (decision #18 dropped it from batch5
// mockup). Your row gets a lime highlight + "BEAT #N ABOVE YOU" chip (Q8
// kept). Free/Paid toggle omitted until "paid" means something pre-launch.
// Pure presentational; renders inside AppShell.
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import InitialsAvatar from './components/InitialsAvatar';
import { COLORS, FONTS, RADII, useScale } from './theme';

function winPct(r) {
  const n = r.w + r.l + r.d;
  return n ? Math.round((r.w / n) * 100) : 0;
}

function Row({ row, isYou }) {
  const s = useScale();
  return (
    <View>
      {isYou ? (
        <View style={{ alignSelf: 'flex-end', marginRight: 12 * s, marginBottom: -14 * s, zIndex: 5,
          backgroundColor: COLORS.lime, borderRadius: 12 * s,
          paddingVertical: 8 * s, paddingHorizontal: 20 * s }}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: '#10140C',
            letterSpacing: 0.06 * 24 * s }}>BEAT #{row.rank - 1} ABOVE YOU ↑</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 * s,
        backgroundColor: isYou ? 'rgba(212,242,60,0.10)' : 'rgba(16,20,13,0.82)',
        borderWidth: isYou ? 2.5 * s : 1.5 * s,
        borderColor: isYou ? COLORS.lime : 'rgba(245,241,230,0.18)',
        borderRadius: RADII.answer * s, paddingVertical: 22 * s, paddingHorizontal: 28 * s,
        marginBottom: 18 * s,
        ...(isYou ? { shadowColor: COLORS.limeGlow, shadowOffset: { width: 0, height: 0 },
          shadowRadius: 16 * s, shadowOpacity: 1 } : null) }}>
        <View style={{ width: 92 * s, height: 56 * s, borderRadius: 14 * s,
          backgroundColor: row.rank <= 3 ? COLORS.lime : 'rgba(42,40,26,0.8)',
          borderWidth: 1.5 * s, borderColor: row.rank <= 3 ? COLORS.lime : 'rgba(245,241,230,0.25)',
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s,
            color: row.rank <= 3 ? '#10140C' : COLORS.cream }}>#{row.rank}</Text>
        </View>
        <InitialsAvatar handle={row.name} size={88} ring={2.5} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.interExtra, fontSize: 34 * s,
          color: isYou ? COLORS.lime : COLORS.cream }}>
          {isYou ? `YOU · ${row.name}` : row.name}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim }}>
            {row.w}W · {row.l}L · {row.d}D</Text>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 30 * s, color: COLORS.lime,
            marginTop: 4 * s }}>{winPct(row)}%</Text>
        </View>
      </View>
    </View>);
}

export default function LeaderboardScreen({ rows = [], yourName = null }) {
  const s = useScale();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 * s }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 110 * s, color: COLORS.wordmark,
        textAlign: 'center', includeFontPadding: false, marginBottom: 36 * s }}>LEADERBOARD</Text>
      <View style={{ paddingHorizontal: 45 * s }}>
        {rows.map((row) => (
          <Row key={row.rank} row={row} isYou={yourName != null && row.name === yourName} />))}
      </View>
    </ScrollView>
  );
}
