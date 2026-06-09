// Segmented 4-cell bottom nav (prototype: top 2080 / bottom 4, inset 12,
// h 140, gap 6, cells radius 20 bg rgba(18,24,16,0.85), 66px icons,
// 24px 700 labels, active = lime). Icons are the prototype's own SVGs.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from '../theme';

function Icon({ tab, color, size }) {
  const sw = 2;
  if (tab === 'play') return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 L4 14 H11 L10 22 L19 10 H12 L13 2 Z" fill={color} />
    </Svg>);
  if (tab === 'results') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={6} stroke={color} strokeWidth={sw} />
      <Path d="M8 14 L6 22 L12 18 L18 22 L16 14" stroke={color} strokeWidth={sw} />
    </Svg>);
  if (tab === 'profile') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={sw} />
      <Path d="M4 22 Q4 14, 12 14 Q20 14, 20 22" stroke={color} strokeWidth={sw} />
    </Svg>);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={4} height={9} stroke={color} strokeWidth={sw} />
      <Rect x={10} y={8} width={4} height={13} stroke={color} strokeWidth={sw} />
      <Rect x={17} y={4} width={4} height={17} stroke={color} strokeWidth={sw} />
      <Path d="M10 3 L12 1 L14 3 L13 5 L11 5 Z" fill={color} />
    </Svg>);
}

const TABS = [
  { key: 'play', label: 'PLAY' },
  { key: 'results', label: 'RESULTS' },
  { key: 'profile', label: 'PROFILE' },
  { key: 'leaderboard', label: 'LEADERBOARD' },
];

export default function SegmentedNav({ active = 'play', onTab }) {
  const s = useScale();
  return (
    <View style={{ position: 'absolute', left: 12 * s, right: 12 * s, bottom: 4 * s, height: 140 * s,
      flexDirection: 'row', gap: 6 * s, zIndex: 15 }}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? COLORS.lime : COLORS.navLabel;
        return (
          <Pressable key={t.key} onPress={() => onTab && onTab(t.key)}
            style={{ flex: 1, backgroundColor: COLORS.navBg, borderWidth: 1.5 * s,
              borderColor: COLORS.navBorder, borderRadius: RADII.nav * s,
              alignItems: 'center', justifyContent: 'center', gap: 10 * s }}>
            <Icon tab={t.key} color={color} size={66 * s} />
            <Text numberOfLines={1} style={{ color, fontFamily: FONTS.interBold, fontSize: 24 * s,
              letterSpacing: 0.06 * 24 * s }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
