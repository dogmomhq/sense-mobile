// ── DEPOSIT STUB (DECISIONS 2026-06-11 #22 + Q5: visible, stubbed) ──────────
// Per batch6/depositstub.png: ADD FUNDS headline, greyed/locked amount chips
// $5/$10/$25/$50 with a lock + "DEPOSITS COMING SOON" pill across them,
// current balance, lime "NOTIFY ME · EARN FREE COINS" CTA (Q5: notify
// collects contact AND awards free coins), waitlist caption. No payment
// wiring whatsoever — `onNotify` fires the existing requestDepositNotify.
// Pure presentational; renders inside AppShell.
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';

function Lock({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={10} width={14} height={10} rx={2} fill="rgba(16,20,13,0.95)"
        stroke={COLORS.cream} strokeWidth={1.8} />
      <Path d="M8 10 V7 A4 4 0 0 1 16 7 V10" stroke={COLORS.cream} strokeWidth={1.8} />
    </Svg>);
}

export default function DepositScreen({
  amounts = ['$5', '$10', '$25', '$50'], balance = '$24.50', onNotify,
}) {
  const s = useScale();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 * s }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark,
        textAlign: 'center', includeFontPadding: false, marginBottom: 50 * s }}>ADD FUNDS</Text>

      {/* greyed amount grid + coming-soon lock overlay */}
      <View style={{ marginHorizontal: 45 * s, marginBottom: 50 * s }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 * s, opacity: 0.38 }}>
          {amounts.map((a) => (
            <View key={a} style={{ width: '47%', flexGrow: 1, backgroundColor: 'rgba(16,20,13,0.82)',
              borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.3)', borderRadius: RADII.answer * s,
              alignItems: 'center', paddingVertical: 70 * s }}>
              <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, color: COLORS.cream,
                includeFontPadding: false }}>{a}</Text>
            </View>))}
        </View>
        {/* lock + pill, centered over the grid */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0,
          bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 18 * s }}>
          <Lock size={64 * s} />
          <View style={{ backgroundColor: 'rgba(16,20,13,0.95)', borderWidth: 1.5 * s,
            borderColor: 'rgba(245,241,230,0.35)', borderRadius: 30 * s,
            paddingVertical: 16 * s, paddingHorizontal: 36 * s }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.cream,
              letterSpacing: 0.08 * 32 * s }}>DEPOSITS COMING SOON</Text>
          </View>
        </View>
      </View>

      {/* balance line */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline',
        gap: 16 * s, marginBottom: 56 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 36 * s, color: COLORS.cream,
          letterSpacing: 0.08 * 36 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.lime }}>{balance}</Text>
      </View>

      {/* notify CTA */}
      <PressBtn onPress={onNotify} style={{ marginHorizontal: 45 * s, backgroundColor: COLORS.lime,
        borderRadius: RADII.cta * s, paddingVertical: 46 * s, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C',
          letterSpacing: 0.03 * 60 * s, includeFontPadding: false }}>NOTIFY ME · EARN FREE COINS</Text>
      </PressBtn>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim,
        textAlign: 'center', letterSpacing: 0.1 * 26 * s, marginTop: 30 * s }}>
        BE FIRST IN LINE WHEN DEPOSITS OPEN</Text>
    </ScrollView>
  );
}
