// ── HISTORY (DECISIONS 2026-06-11 #16/#17 + batch6 historymerged/practice/
//    cancellock mockups) ─────────────────────────────────────────────────────
// Two tabs: MATCHES | PRACTICE (Matches + Transactions MERGED per #16).
// MATCHES = a RUNNING LEDGER (CJ spec 2026-06-11): ONE unified row type — every
//   credit movement is a row, enriched with match context where applicable:
//   · STAKE  −$X · 'STAKED · VS ???' (pending) or annotated 'LOST · times' once
//     settled as a loss (no second money row for losses — money left at stake)
//   · PAYOUT +$X · 'WON VS NAME · 1.42s VS 1.76s'
//   · REFUND +$X · 'MATCH CANCELLED / EXPIRED' — or 'DRAW · STAKE RETURNED'
//   · DEPOSIT / BONUS rows as-is
//   Every row shows the running balance (server balance_after).
//   Pending match cards (CANCEL + lockout ring) stay pinned on top; their
//   STAKE row ALSO appears in the feed per the spec.
// PRACTICE = W/L/D record tiles + practice-vs-computer card + START PRACTICE
//   CTA + recent practice log rows.
// Pure presentational: everything arrives via props; renders inside AppShell.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';

const RED = '#FF5A48';
const GREY = 'rgba(245,241,230,0.45)';

/* ── date+time stamp per row (owner request 2026-06-13): explicit calendar
      date AND clock time, e.g. "JUN 12 · 10:43 PM". Replaces the relative
      "age stamps" that were removed earlier. ── */
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${mm} ${ap}`;
}


/* ── badge palette per row type ── */
const BADGE = {
  win:       { label: 'WIN',       bg: COLORS.lime, border: COLORS.lime, text: '#10140C' },
  loss:      { label: 'LOSS',      bg: 'rgba(255,90,72,0.16)', border: RED, text: RED },
  draw:      { label: 'DRAW',      bg: 'transparent', border: COLORS.cream, text: COLORS.cream },
  cancelled: { label: 'CANCELLED', bg: 'transparent', border: GREY, text: GREY },
  pending:   { label: 'PENDING',   bg: 'transparent', border: COLORS.lime, text: COLORS.lime },
  stake:     { label: 'STAKE',     bg: 'transparent', border: COLORS.cream, text: COLORS.cream },
  refund:    { label: 'REFUND',    bg: 'transparent', border: GREY, text: GREY },
  deposit:   { label: 'DEPOSIT',   bg: 'transparent', border: COLORS.lime, text: COLORS.lime },
  bonus:     { label: 'BONUS',     bg: 'transparent', border: COLORS.lime, text: COLORS.lime },
  other:     { label: 'CREDIT',    bg: 'transparent', border: GREY, text: GREY },
};

function Badge({ kind, label }) {
  const s = useScale();
  const b = BADGE[kind] || BADGE.other;
  return (
    <View style={{ backgroundColor: b.bg, borderWidth: 2 * s, borderColor: b.border,
      borderRadius: 16 * s, paddingVertical: 14 * s, paddingHorizontal: 28 * s,
      alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 34 * s,
        letterSpacing: 0.06 * 28 * s, color: b.text }}>{label || b.label}</Text>
    </View>
  );
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
          {row.createdAt ? (
            <Text style={{ fontFamily: FONTS.mono, fontSize: 22 * s, color: GREY }}>
              {fmtDateTime(row.createdAt)}{row.expirySec != null ? `  ·  EXPIRES IN ${Math.floor(row.expirySec / 60)}:${String(row.expirySec % 60).padStart(2, '0')}` : ''}
            </Text>
          ) : null}
        </View>
        <CancelControl lockoutSec={row.lockoutSec} onCancel={() => onCancel && onCancel(row)} />
      </View>
    </RowCard>);
}

/* ── ONE unified feed row: a money event + optional match context.
      row = { badge, label?, title, sub?, amount, balance } ── */
function FeedRow({ row }) {
  const s = useScale();
  const pos = String(row.amount || '').startsWith('+');
  const amtColor = pos ? COLORS.lime : RED;
  const border = row.badge === 'loss' ? 'rgba(255,90,72,0.45)'
    : row.badge === 'win' ? 'rgba(215,248,74,0.35)' : 'rgba(245,241,230,0.18)';
  return (
    <RowCard borderColor={border}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * s, flex: 1 }}>
          <Badge kind={row.badge} label={row.label} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s,
              color: COLORS.cream }}>{row.title}</Text>
            {row.sub ? (
              <Text numberOfLines={1} style={{ fontFamily: FONTS.mono, fontSize: 28 * s,
                color: COLORS.creamDim, marginTop: 8 * s }}>{row.sub}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 46 * s, color: amtColor }}>
            {row.amount}</Text>
          {row.balance ? (
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 27 * s, color: COLORS.creamDim,
              marginTop: 8 * s }}>BAL {row.balance}</Text>
          ) : null}
          {row.ts ? (
            <Text style={{ fontFamily: FONTS.mono, fontSize: 22 * s, color: GREY,
              marginTop: 8 * s }}>{fmtDateTime(row.ts)}</Text>
          ) : null}
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
        <Text style={{ fontFamily: FONTS.anton, fontSize: 76 * s, lineHeight: 1.32 * 76 * s,
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
  pending = [], feed = [],            // feed rows: {badge,label?,title,sub?,amount,balance}
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
          {feed.map((row, i) => <FeedRow key={i} row={row} />)}
        </View>
      )}
    </ScrollView>
  );
}
