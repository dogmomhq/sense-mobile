// ── HISTORY (DECISIONS 2026-06-11 #16/#17 + batch6 historymerged/practice/
//    cancellock mockups) ─────────────────────────────────────────────────────
// Two tabs: MATCHES | PRACTICE (Matches + Transactions MERGED per #16).
// MATCHES = one chronological feed mixing:
//   · pending match rows on top (PENDING badge, vs ???, locked time, stake,
//     CANCEL — or the cancel-lockout state: greyed CANCEL + countdown ring
//     when `cancel-denied` remainingMs < 2min, per #17)
//   · match rows  (WIN/LOSS/DRAW/CANCELLED badge, vs name, your·their time,
//     payout +/- and running balance, time-ago)
//   · ledger rows (DEPOSIT/PAYOUT/STAKE/REFUND, amount, running balance from
//     `balance_after` — ESCROW DISPLAY RULE: stake-out shows while pending,
//     refund row on cancel/expiry)
// PRACTICE = W/L/D record tiles + practice-vs-computer card + START PRACTICE
//   CTA + recent practice log rows.
// Pure presentational: everything arrives via props; renders inside AppShell.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';

const RED = '#FF5A48';
const GREY = 'rgba(245,241,230,0.45)';

/* ── badge palette per row type ── */
const BADGE = {
  win:       { label: 'WIN',       bg: COLORS.lime, border: COLORS.lime, text: '#10140C' },
  loss:      { label: 'LOSS',      bg: 'rgba(255,90,72,0.16)', border: RED, text: RED },
  draw:      { label: 'DRAW',      bg: 'transparent', border: COLORS.cream, text: COLORS.cream },
  cancelled: { label: 'CANCELLED', bg: 'transparent', border: GREY, text: GREY },
  pending:   { label: 'PENDING',   bg: 'transparent', border: COLORS.lime, text: COLORS.lime },
};

function Badge({ kind }) {
  const s = useScale();
  const b = BADGE[kind] || BADGE.draw;
  return (
    <View style={{ backgroundColor: b.bg, borderWidth: 2 * s, borderColor: b.border,
      borderRadius: 16 * s, paddingVertical: 14 * s, paddingHorizontal: 28 * s,
      alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 34 * s,
        letterSpacing: 0.06 * 28 * s, color: b.text }}>{b.label}</Text>
    </View>
  );
}

/* ── ledger icon set ── */
function LedgerIcon({ type, color }) {
  const s = useScale();
  const size = 52 * s, sw = 2;
  if (type === 'deposit') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={sw} />
      <Path d="M12 7 L12 16 M8.5 12.5 L12 16 L15.5 12.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>);
  if (type === 'payout') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 4 H18 V8 C18 13 15 16 12 16 C9 16 6 13 6 8 Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M12 16 V19 M8 21 H16" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M6 6 H3.5 C3.5 10 5 11.5 7 12 M18 6 H20.5 C20.5 10 19 11.5 17 12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>);
  if (type === 'refund') return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12 A7 7 0 1 1 12 19" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M5 8 L5 12.5 L9.5 12.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>);
  // stake: paw
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={8.5} r={2} fill={color} />
      <Circle cx={16} cy={8.5} r={2} fill={color} />
      <Circle cx={4.5} cy={12.5} r={1.7} fill={color} />
      <Circle cx={19.5} cy={12.5} r={1.7} fill={color} />
      <Path d="M12 11 C 15 11, 17.5 14, 17 16.5 C 16.6 18.8, 14.5 20, 12 20 C 9.5 20, 7.4 18.8, 7 16.5 C 6.5 14, 9 11, 12 11 Z" fill={color} />
    </Svg>);
}

/* ── cancel button: live (lime ghost) or locked-out (greyed + countdown ring,
      shown when remaining lockout < 2 min per cancellock.png) ── */
function CancelControl({ lockoutSec, onCancel }) {
  const s = useScale();
  const locked = lockoutSec != null && lockoutSec > 0;
  const D = 150;
  if (!locked) return (
    <Pressable onPress={onCancel} style={{ borderWidth: 2.5 * s, borderColor: COLORS.lime,
      borderRadius: 18 * s, paddingVertical: 16 * s, paddingHorizontal: 30 * s }}>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s,
        letterSpacing: 0.08 * 30 * s, color: COLORS.lime }}>CANCEL</Text>
    </Pressable>);
  const mm = Math.floor(lockoutSec / 60), ss = String(lockoutSec % 60).padStart(2, '0');
  const frac = Math.min(1, lockoutSec / 120);     // ring drains over the 2-min window
  const R = 64, C = 2 * Math.PI * R;
  return (
    <View style={{ width: D * s, height: D * s, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={D * s} height={D * s} viewBox={`0 0 ${D} ${D}`} style={{ position: 'absolute' }}>
        <Circle cx={D / 2} cy={D / 2} r={R} stroke="rgba(245,241,230,0.18)" strokeWidth={7} fill="rgba(16,20,13,0.7)" />
        <Circle cx={D / 2} cy={D / 2} r={R} stroke={GREY} strokeWidth={7} fill="none"
          strokeDasharray={`${C * frac} ${C}`} strokeLinecap="round"
          transform={`rotate(-90 ${D / 2} ${D / 2})`} />
      </Svg>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: GREY,
        letterSpacing: 0.06 * 24 * s }}>CANCEL</Text>
      <Text style={{ fontFamily: FONTS.mono, fontSize: 30 * s, color: COLORS.cream }}>{`${mm}:${ss}`}</Text>
    </View>);
}

/* ── row card chrome shared by every feed row ── */
function RowCard({ children, borderColor = 'rgba(215,248,74,0.35)', style }) {
  const s = useScale();
  return (
    <View style={[{ backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s,
      borderColor, borderRadius: RADII.answer * s, paddingVertical: 44 * s,
      paddingHorizontal: 36 * s, marginBottom: 24 * s }, style]}>
      {children}
    </View>);
}

function PendingRow({ row, onCancel }) {
  const s = useScale();
  return (
    <RowCard borderColor={COLORS.lime}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 12 * s }}>
          <Badge kind="pending" />
          <Text style={{ fontFamily: FONTS.anton, fontSize: 56 * s, color: COLORS.cream,
            includeFontPadding: false }}>VS ???</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim,
            letterSpacing: 0.06 * 28 * s }}>
            YOU LOCKED {row.yourTime} · WAITING
          </Text>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.cream }}>{row.stake}</Text>
        </View>
        <CancelControl lockoutSec={row.lockoutSec} onCancel={() => onCancel && onCancel(row)} />
      </View>
    </RowCard>);
}

function MatchRow({ row }) {
  const s = useScale();
  const b = BADGE[row.result] || BADGE.draw;
  const amtColor = row.amount.startsWith('+') && row.amount !== '+$0.00' ? COLORS.lime
    : row.amount.startsWith('-') ? RED : COLORS.cream;
  return (
    <RowCard borderColor={row.result === 'loss' ? 'rgba(255,90,72,0.45)'
      : row.result === 'cancelled' ? 'rgba(245,241,230,0.18)' : 'rgba(215,248,74,0.35)'}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s, flex: 1 }}>
          <Badge kind={row.result} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONTS.interExtra, fontSize: 40 * s,
              color: COLORS.cream }}>vs {row.opponent}</Text>
            <Text style={{ fontFamily: FONTS.mono, fontSize: 30 * s, color: COLORS.creamDim,
              marginTop: 8 * s }}>
              {row.result === 'cancelled' ? '— · —' : `${row.yourTime} · ${row.theirTime}`}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 46 * s, color: amtColor }}>
            {row.amount}</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 27 * s, color: COLORS.creamDim,
            marginTop: 8 * s }}>
            {row.result === 'cancelled' ? '(Refund) ' : ''}BAL {row.balance}</Text>
        </View>
      </View>
    </RowCard>);
}

function LedgerRow({ row }) {
  const s = useScale();
  const pos = row.amount.startsWith('+');
  const color = pos ? COLORS.lime : RED;
  return (
    <RowCard borderColor="rgba(245,241,230,0.18)">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 * s }}>
          <LedgerIcon type={row.type} color={color} />
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 40 * s,
            letterSpacing: 0.06 * 40 * s, color: COLORS.cream }}>{row.type.toUpperCase()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 46 * s, color }}>{row.amount}</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 27 * s, color: COLORS.creamDim,
            marginTop: 8 * s }}>BAL {row.balance}</Text>
        </View>
      </View>
    </RowCard>);
}

/* ── PRACTICE tab ── */
function PracticeTab({ practice, onStartPractice }) {
  const s = useScale();
  const tiles = [
    { v: `${practice.w} W`, c: COLORS.lime },
    { v: `${practice.l} L`, c: RED },
    { v: `${practice.d} D`, c: COLORS.cream },
  ];
  return (
    <View style={{ paddingHorizontal: 45 * s }}>
      {/* practice-vs-computer card (batch6/practice.png) */}
      <View style={{ borderWidth: 2.5 * s, borderColor: COLORS.lime, borderRadius: RADII.glass * s,
        backgroundColor: 'rgba(16,20,13,0.82)', alignItems: 'center',
        paddingVertical: 50 * s, paddingHorizontal: 36 * s, marginBottom: 28 * s }}>
        <Svg width={64 * s} height={64 * s} viewBox="0 0 24 24" fill="none">
          <Rect x={6} y={6} width={12} height={12} rx={2} stroke={COLORS.lime} strokeWidth={1.8} />
          <Rect x={9.5} y={9.5} width={5} height={5} fill={COLORS.lime} />
          {[8, 12, 16].map((p) => (
            <React.Fragment key={p}>
              <Path d={`M${p} 6 L${p} 2.5`} stroke={COLORS.lime} strokeWidth={1.8} strokeLinecap="round" />
              <Path d={`M${p} 18 L${p} 21.5`} stroke={COLORS.lime} strokeWidth={1.8} strokeLinecap="round" />
              <Path d={`M6 ${p} L2.5 ${p}`} stroke={COLORS.lime} strokeWidth={1.8} strokeLinecap="round" />
              <Path d={`M18 ${p} L21.5 ${p}`} stroke={COLORS.lime} strokeWidth={1.8} strokeLinecap="round" />
            </React.Fragment>))}
        </Svg>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 76 * s, lineHeight: 88 * s,
          color: COLORS.cream, textAlign: 'center', marginTop: 24 * s,
          includeFontPadding: false }}>PRACTICE VS{'\n'}COMPUTER · FREE</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim,
          letterSpacing: 0.1 * 28 * s, marginTop: 18 * s }}>NO STAKES · SHARPEN YOUR SENSES</Text>
      </View>

      {/* W/L/D tiles */}
      <View style={{ flexDirection: 'row', gap: 20 * s, marginBottom: 28 * s }}>
        {tiles.map((t) => (
          <View key={t.v} style={{ flex: 1, backgroundColor: 'rgba(16,20,13,0.82)',
            borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.18)', borderRadius: RADII.answer * s,
            alignItems: 'center', paddingVertical: 36 * s }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: t.c,
              includeFontPadding: false }}>{t.v}</Text>
          </View>))}
      </View>

      {/* START PRACTICE (lime CTA — same entry as Home's PRACTICE FREE) */}
      <Pressable onPress={onStartPractice} style={{ backgroundColor: COLORS.lime,
        borderRadius: RADII.cta * s, paddingVertical: 42 * s, alignItems: 'center',
        marginBottom: 28 * s,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 66 * s, color: '#10140C',
          letterSpacing: 0.04 * 66 * s, includeFontPadding: false }}>START PRACTICE</Text>
      </Pressable>

      {/* recent practice log */}
      {(practice.log || []).map((row, i) => (
        <RowCard key={i} borderColor="rgba(245,241,230,0.18)">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s }}>
              <Badge kind={row.result} />
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.cream }}>
                {row.animal}</Text>
            </View>
            <Text style={{ fontFamily: FONTS.mono, fontSize: 28 * s, color: COLORS.creamDim }}>
              {row.yourTime}</Text>
          </View>
        </RowCard>))}
    </View>);
}

export default function HistoryScreen({
  tab: tabProp = 'matches', onTabChange,
  pending = [], feed = [],            // feed rows: {kind:'match'|'ledger', ...}
  practice = { w: 0, l: 0, d: 0, log: [] },
  onCancelPending, onStartPractice,
}) {
  const s = useScale();
  const [tab, setTab] = useState(tabProp);
  const pick = (t) => { setTab(t); onTabChange && onTabChange(t); };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 * s }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 110 * s, color: COLORS.wordmark,
        textAlign: 'center', includeFontPadding: false, marginBottom: 30 * s }}>HISTORY</Text>

      {/* MATCHES | PRACTICE segmented tabs */}
      <View style={{ flexDirection: 'row', marginHorizontal: 45 * s, marginBottom: 32 * s,
        backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s,
        borderColor: 'rgba(245,241,230,0.18)', borderRadius: 20 * s, padding: 8 * s, gap: 8 * s }}>
        {[['matches', 'MATCHES'], ['practice', 'PRACTICE']].map(([key, label]) => {
          const sel = tab === key;
          return (
            <Pressable key={key} onPress={() => pick(key)} style={{ flex: 1,
              backgroundColor: sel ? COLORS.lime : 'transparent', borderRadius: 14 * s,
              alignItems: 'center', paddingVertical: 22 * s }}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s,
                letterSpacing: 0.08 * 32 * s, color: sel ? '#10140C' : COLORS.cream }}>{label}</Text>
            </Pressable>);
        })}
      </View>

      {tab === 'practice' ? (
        <PracticeTab practice={practice} onStartPractice={onStartPractice} />
      ) : (
        <View style={{ paddingHorizontal: 45 * s }}>
          {pending.map((row, i) => (
            <PendingRow key={`p${i}`} row={row} onCancel={onCancelPending} />))}
          {feed.map((row, i) => row.kind === 'ledger'
            ? <LedgerRow key={i} row={row} />
            : <MatchRow key={i} row={row} />)}
        </View>
      )}
    </ScrollView>
  );
}
