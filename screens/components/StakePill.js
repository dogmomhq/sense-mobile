// Stake pill, centered under the header (prototype: top 292, pad 14/44,
// radius 40, lime 800 34px, letter-spacing 0.06em).
import React from 'react';
import { View, Text } from 'react-native';
import { COLORS, FONTS, RADII, useScale, headerOffset } from '../theme';

export default function StakePill({ text = '$1.00 · WIN $1.90' }) {
  const s = useScale();
  // shift with the header below the status bar / island on device (0 on web).
  // Uses the SAME offset as every other below-header element (theme.headerOffset
  // = (safeTop + 24) - 94*s) so the stake pill never overlaps the glass header.
  const headerShift = headerOffset(s);
  return (
    <View style={{ position: 'absolute', top: 292 * s + headerShift, left: 0, right: 0, alignItems: 'center', zIndex: 15 }}>
      <View style={{ backgroundColor: COLORS.stakeBg, borderWidth: 1.5 * s, borderColor: COLORS.stakeBorder,
        borderRadius: RADII.stake * s, paddingVertical: 14 * s, paddingHorizontal: 44 * s }}>
        <Text style={{ color: COLORS.lime, fontFamily: FONTS.interExtra, fontSize: 34 * s,
          letterSpacing: 0.06 * 34 * s }}>{text}</Text>
      </View>
    </View>
  );
}
