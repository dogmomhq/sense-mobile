// ── AMOUNT KEYPAD (B132, 2026-09-10) ─────────────────────────────────────────────────────────
// Triumph-style money entry: one huge figure, a row of quick chips, a 3×4 keypad. Shared by the
// deposit and withdraw screens so the two feel like one product. Holds the amount as a STRING of
// what was typed ("12.5") so the display never jumps; the parent reads `cents`.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLORS, FONTS, useScale } from '../theme';

export const toCents = (str) => { const v = Math.round(parseFloat(str || '0') * 100); return Number.isFinite(v) && v > 0 ? v : 0; };
export const fromCents = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

export default function AmountKeypad({ value, onChange, chips = [], maxCents = null, allowCents = true, disabled = false, hint = null, tone = COLORS.cream }) {
  const s = useScale();
  const press = (k) => {
    if (disabled) return;
    let v = String(value || '');
    if (k === 'back') { v = v.slice(0, -1); }
    else if (k === '.') { if (!allowCents || v.includes('.')) return; v = (v || '0') + '.'; }
    else {
      if (v === '0') v = '';
      const [whole, frac] = v.split('.');
      if (frac != null) { if (frac.length >= 2) return; v = v + k; }
      else { if (whole.length >= 5) return; v = v + k; }
      if (maxCents != null && toCents(v) > maxCents) v = fromCents(maxCents);
    }
    onChange(v);
  };
  const shown = value ? '$' + value : '$0';
  const keys = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [allowCents ? '.' : '', '0', 'back']];
  return (
    <View>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 180 * s, color: tone, textAlign: 'center', includeFontPadding: false, marginBottom: 6 * s }} numberOfLines={1} adjustsFontSizeToFit>{shown}</Text>
      {hint ? <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, textAlign: 'center', marginBottom: 20 * s, letterSpacing: 0.04 * 24 * s }}>{hint}</Text> : <View style={{ height: 20 * s }} />}
      {chips.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 * s, marginHorizontal: 40 * s, marginBottom: 30 * s }}>
          {chips.map((c) => { const on = toCents(value) === c.cents; return (
            <Pressable key={c.label} onPress={() => !disabled && onChange(fromCents(c.cents))} style={{ flex: 1, alignItems: 'center', paddingVertical: 22 * s, borderRadius: 40 * s, borderWidth: 2 * s,
              borderColor: on ? COLORS.lime : 'rgba(245,241,230,0.14)', backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(245,241,230,0.06)' }}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: on ? COLORS.lime : COLORS.cream }}>{c.label}</Text>
            </Pressable>); })}
        </View>) : null}
      <View style={{ marginHorizontal: 40 * s }}>
        {keys.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {row.map((k, j) => (
              <Pressable key={j} onPress={() => k && press(k)} disabled={!k || disabled} style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 26 * s, opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ fontFamily: FONTS.interBold, fontSize: k === 'back' ? 60 * s : 76 * s, color: COLORS.cream, includeFontPadding: false }}>{k === 'back' ? '⌫' : k}</Text>
              </Pressable>))}
          </View>))}
      </View>
    </View>
  );
}
