// Segmented 4-cell bottom nav (prototype: top 2080 / bottom 4, inset 12,
// h 140, gap 6, cells radius 20 bg rgba(18,24,16,0.85), 66px icons,
// 24px 700 labels, active = lime).
// Tabs per DECISIONS 2026-06-11 (#15): HOME · HISTORY · PROFILE · LEADERBOARD
// (Challenge paused for MVP — no entry point). HOME gets the paw icon.
// `badges` prop: { history: true } renders a lime badge dot (pending matches).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path, Circle, Ellipse, Rect } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale, getSafeBottom } from '../theme';

function Icon({ tab, color, size }) {
  const sw = 2;
  if (tab === 'home') return (   // paw print
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Ellipse cx={7.2} cy={8.2} rx={2.1} ry={2.9} fill={color} />
      <Ellipse cx={16.8} cy={8.2} rx={2.1} ry={2.9} fill={color} />
      <Ellipse cx={3.4} cy={13.2} rx={1.8} ry={2.5} fill={color} />
      <Ellipse cx={20.6} cy={13.2} rx={1.8} ry={2.5} fill={color} />
      <Path d="M12 11 C 15.5 11, 18.5 14.5, 18 17.5 C 17.6 20, 15 21.5, 12 21.5 C 9 21.5, 6.4 20, 6 17.5 C 5.5 14.5, 8.5 11, 12 11 Z" fill={color} />
    </Svg>);
  if (tab === 'history') return (   // paw print (batch6 nav spec: paw, same as HOME)
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Ellipse cx={7.2} cy={8.2} rx={2.1} ry={2.9} fill={color} />
      <Ellipse cx={16.8} cy={8.2} rx={2.1} ry={2.9} fill={color} />
      <Ellipse cx={3.4} cy={13.2} rx={1.8} ry={2.5} fill={color} />
      <Ellipse cx={20.6} cy={13.2} rx={1.8} ry={2.5} fill={color} />
      <Path d="M12 11 C 15.5 11, 18.5 14.5, 18 17.5 C 17.6 20, 15 21.5, 12 21.5 C 9 21.5, 6.4 20, 6 17.5 C 5.5 14.5, 8.5 11, 12 11 Z" fill={color} />
    </Svg>);
  if (tab === 'profile') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={sw} />
      <Path d="M4 22 Q4 14, 12 14 Q20 14, 20 22" stroke={color} strokeWidth={sw} />
    </Svg>);
  return (   // leaderboard bars + star
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={4} height={9} stroke={color} strokeWidth={sw} />
      <Rect x={10} y={8} width={4} height={13} stroke={color} strokeWidth={sw} />
      <Rect x={17} y={4} width={4} height={17} stroke={color} strokeWidth={sw} />
      <Path d="M10 3 L12 1 L14 3 L13 5 L11 5 Z" fill={color} />
    </Svg>);
}

const TABS = [
  { key: 'home', label: 'HOME' },
  { key: 'history', label: 'HISTORY' },
  { key: 'profile', label: 'PROFILE' },
  { key: 'leaderboard', label: 'LEADERBOARD' },
];

export default function SegmentedNav({ active = 'home', onTab, badges = {} }) {
  const s = useScale();
  return (
    <View style={{ position: 'absolute', left: 12 * s, right: 12 * s, bottom: 4 * s + getSafeBottom(), height: 140 * s,
      flexDirection: 'row', gap: 6 * s, zIndex: 15 }}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? COLORS.lime : COLORS.navLabel;
        return (
          <Pressable key={t.key} onPress={() => onTab && onTab(t.key)}
            style={{ flex: 1, backgroundColor: COLORS.navBg, borderWidth: 1.5 * s,
              borderColor: COLORS.navBorder, borderRadius: RADII.nav * s,
              alignItems: 'center', justifyContent: 'center', gap: 10 * s }}>
            <View>
              <Icon tab={t.key} color={color} size={66 * s} />
              {badges[t.key] ? (
                <View style={{ position: 'absolute', top: -4 * s, right: -10 * s,
                  width: 22 * s, height: 22 * s, borderRadius: 11 * s, backgroundColor: COLORS.lime,
                  borderWidth: 2 * s, borderColor: COLORS.forest }} />
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ color, fontFamily: FONTS.interBold, fontSize: 24 * s,
              letterSpacing: 0.06 * 24 * s }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
