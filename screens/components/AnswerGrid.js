// 2x2 Anton answer grid (prototype: left/right 45, bottom 120, gap 24,
// cells bg rgba(16,20,13,0.82), border 2.5 lime@55%, radius 24, pad 46/20,
// Anton 52px uppercase, letter-spacing 0.04em).
// States: pressed (finger down) = lime border + lime wash;
//         locked (answer submitted) = solid lime cell, others dimmed.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLORS, FONTS, RADII, useScale } from '../theme';

export default function AnswerGrid({ answers = [], onAnswer, lockedIndex = null, disabled = false }) {
  const s = useScale();
  const cellW = (1024 - 45 * 2 - 24) / 2; // 455 prototype px
  return (
    <View style={{ position: 'absolute', left: 45 * s, right: 45 * s, bottom: 120 * s,
      flexDirection: 'row', flexWrap: 'wrap', gap: 24 * s, zIndex: 15 }}>
      {answers.map((label, i) => {
        const locked = lockedIndex != null;
        const isLocked = lockedIndex === i;
        return (
          <Pressable key={i} disabled={disabled || locked} onPress={() => onAnswer && onAnswer(i, label)}
            style={({ pressed }) => ({
              width: cellW * s,
              backgroundColor: isLocked ? COLORS.lime : pressed ? COLORS.ansPressedBg : COLORS.ansBg,
              borderWidth: 2.5 * s,
              borderColor: isLocked || pressed ? COLORS.lime : COLORS.ansBorder,
              borderRadius: RADII.answer * s,
              paddingVertical: 46 * s, paddingHorizontal: 20 * s,
              alignItems: 'center',
              opacity: locked && !isLocked ? 0.45 : 1,
            })}>
            <Text numberOfLines={1} style={{ fontFamily: FONTS.anton, fontSize: 52 * s, lineHeight: 76 * s,
              letterSpacing: 0.04 * 52 * s, color: isLocked ? COLORS.black : COLORS.cream,
              textTransform: 'uppercase', textAlign: 'center' }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
