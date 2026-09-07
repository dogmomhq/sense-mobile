// ── MATCH DETAIL + ANALYTICS (CJ 2026-09-07) ─────────────────────────────────
// Opened by tapping a match row in History. Fetches GET /api/match/:id (participant-only)
// and shows: opponent header (rank badge, member since), verdict + money, the animal
// (frame-1 poster via /mposter/:id + correct name), both answers with times, then a
// MATCH ANALYTICS button that reveals the event timeline, the 8-second round chart and
// the Bots / Fair Play cards. No replay — a Sense round IS its two lock-in times.
// Pure presentational except the fetch; `authHeaders` come from App.js playerAuthHeaders.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import InitialsAvatar from './components/InitialsAvatar';
import { RankBadge, RANK_TIERS, ringColor } from './rank';
import { COLORS, FONTS, RADII, useScale } from './theme';

const RED = '#FF5A48';
const BLUE = '#3B9DFF';
const GREY = 'rgba(245,241,230,0.45)';
const fmtMoney = (c) => '$' + (Number(c || 0) / 100).toFixed(2);
const fmtSecs = (ms) => ms == null ? '—' : ms >= 8000 ? 'TIMED OUT' : (Number(ms) / 1000).toFixed(2) + 's';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtStamp(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${String(d.getMinutes()).padStart(2, '0')}${ap}`;
}
const monthYear = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

const Card = ({ s, children, style }) => (
  <View style={[{ backgroundColor: 'rgba(16,20,13,0.86)', borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.16)',
    borderRadius: 28 * s, padding: 34 * s, marginBottom: 24 * s }, style]}>{children}</View>);
const H = ({ s, children, right }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 * s }}>
    <Text style={{ fontFamily: FONTS.anton, fontSize: 48 * s, color: COLORS.cream, includeFontPadding: false }}>{children}</Text>
    {right || null}
  </View>);

/* Round chart: the 8-second round on one axis; a dot where each player locked in. Lime =
   correct, red = wrong, grey = timed out. The gap between the dots is the whole match. */
function RoundChart({ d, s }) {
  const W = 900, Hh = 260, L = 40, R = 40, axisY = 150, roundMs = d.roundMs || 8000;
  const x = (ms) => L + Math.min(1, Math.max(0, Number(ms) / roundMs)) * (W - L - R);
  const dot = (p, y, color) => (p.timeMs == null ? null : (
    <>
      <Line x1={x(p.timeMs)} y1={axisY} x2={x(p.timeMs)} y2={y} stroke={color} strokeWidth={3} strokeDasharray="6 6" />
      <Circle cx={x(p.timeMs)} cy={y} r={16} fill={color} />
      <SvgText x={x(p.timeMs)} y={y - 28} fill={COLORS.cream} fontSize={30} fontWeight="700" textAnchor="middle">{fmtSecs(p.timeMs)}</SvgText>
    </>));
  const col = (p) => p.timeMs != null && p.timeMs >= roundMs ? GREY : p.correct ? COLORS.lime : RED;
  return (
    <Svg width="100%" height={Hh * s} viewBox={`0 0 ${W} ${Hh}`}>
      <Line x1={L} y1={axisY} x2={W - R} y2={axisY} stroke="rgba(245,241,230,0.35)" strokeWidth={3} />
      {[0, 2, 4, 6, 8].map((sec) => (
        <React.Fragment key={sec}>
          <Line x1={x(sec * 1000)} y1={axisY - 10} x2={x(sec * 1000)} y2={axisY + 10} stroke="rgba(245,241,230,0.35)" strokeWidth={3} />
          <SvgText x={x(sec * 1000)} y={axisY + 48} fill={GREY} fontSize={28} textAnchor="middle">{sec}s</SvgText>
        </React.Fragment>))}
      {dot(d.you, axisY - 70, col(d.you))}
      {dot(d.opp, axisY + 100 - 30, col(d.opp))}
      <SvgText x={L} y={40} fill={BLUE} fontSize={26} fontWeight="700">YOU ↑</SvgText>
      <SvgText x={L} y={Hh - 8} fill="#FF9F43" fontSize={26} fontWeight="700">{String(d.opp.handle || 'OPPONENT').toUpperCase()} ↓</SvgText>
    </Svg>);
}

function AnswerRow({ s, label, p, color }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18 * s,
      borderTopWidth: 1, borderTopColor: 'rgba(245,241,230,0.10)' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color, letterSpacing: 0.1 * 24 * s }}>{label}</Text>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 44 * s, color: COLORS.cream, includeFontPadding: false, marginTop: 4 * s }}>
          {String(p.answerText || (p.answerIdx === -1 ? 'TIMED OUT' : '—')).toUpperCase()}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 40 * s, color: COLORS.cream }}>{fmtSecs(p.timeMs)}</Text>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: p.correct ? COLORS.lime : RED, marginTop: 4 * s }}>
          {p.correct ? '✓ CORRECT' : '✗ WRONG'}</Text>
      </View>
    </View>);
}

export default function MatchDetailScreen({ matchId, httpsBase, authHeaders, onClose }) {
  const s = useScale();
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [analytics, setAnalytics] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`${httpsBase}/api/match/${encodeURIComponent(matchId)}`, { headers: authHeaders || {} });
        if (!r.ok) throw new Error('match_' + r.status);
        const j = await r.json(); if (live) setD(j);
      } catch (e) { if (live) setErr(e.message); }
    })();
    return () => { live = false; };
  }, [matchId]);
  const verdict = d && d.you.result;
  const vColor = verdict === 'win' ? COLORS.lime : verdict === 'loss' ? RED : COLORS.cream;
  const vText = verdict === 'win' ? 'YOU WON' : verdict === 'loss' ? 'YOU LOST' : 'DRAW';
  const money = !d ? '' : d.stakeCents === 0 ? 'FREE MATCH' : verdict === 'win' ? `+${fmtMoney(d.prizeCents)} PRIZE` : verdict === 'draw' ? `${fmtMoney(d.stakeCents)} ENTRY RETURNED` : `−${fmtMoney(d.stakeCents)} ENTRY`;
  const tier = d && d.opp.rankTier ? RANK_TIERS[Math.max(1, Math.min(20, d.opp.rankTier)) - 1] : null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,5,0.97)', zIndex: 90 }}>
      <Pressable onPress={onClose} hitSlop={20} style={{ position: 'absolute', top: 120 * s, right: 40 * s, zIndex: 95,
        width: 72 * s, height: 72 * s, borderRadius: 36 * s, backgroundColor: 'rgba(245,241,230,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 40 * s, color: COLORS.cream, includeFontPadding: false }}>×</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingTop: 140 * s, paddingHorizontal: 40 * s, paddingBottom: 120 * s }}>
        {!d && !err ? <ActivityIndicator color={COLORS.lime} style={{ marginTop: 200 * s }} /> : null}
        {err ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: RED, textAlign: 'center', marginTop: 200 * s }}>Couldn't load this match ({err}). Pull to retry from History.</Text> : null}
        {d ? (<>
          {/* opponent header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 * s, marginBottom: 30 * s, paddingRight: 90 * s }}>
            <View>
              <InitialsAvatar handle={d.opp.handle || '?'} size={190} ring={4} fontSize={76} />
              {tier ? <View style={{ position: 'absolute', right: -14 * s, bottom: -10 * s }}><RankBadge tier={d.opp.rankTier} size={80} s={s} /></View> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: '#FF9F43', letterSpacing: 0.14 * 24 * s }}>YOUR OPPONENT</Text>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.anton, fontSize: 68 * s, color: COLORS.cream, includeFontPadding: false, marginTop: 4 * s }}>{d.opp.handle}</Text>
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim, marginTop: 6 * s }}>
                {d.opp.memberSince ? `Joined ${monthYear(d.opp.memberSince)}` : 'Player'}{tier ? `  ·  ${tier.emoji} ${tier.name}` : ''}</Text>
            </View>
          </View>

          {/* verdict */}
          <Card s={s} style={{ alignItems: 'center', borderColor: verdict === 'win' ? 'rgba(215,248,74,0.45)' : verdict === 'loss' ? 'rgba(255,90,72,0.45)' : 'rgba(245,241,230,0.2)' }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, color: vColor, includeFontPadding: false }}>{vText}</Text>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.creamDim, letterSpacing: 0.08 * 32 * s, marginTop: 8 * s }}>{money}</Text>
            {d.reason === 'timing_review' ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim, marginTop: 10 * s, textAlign: 'center' }}>Timing couldn't be verified for this round, so it was scored a draw and both entries were returned.</Text> : null}
            <Text style={{ fontFamily: FONTS.mono, fontSize: 24 * s, color: GREY, marginTop: 14 * s }}>{fmtStamp(d.settledAt)} · {d.stakeCents ? `${fmtMoney(d.stakeCents)} TIER` : 'FREE'}</Text>
          </Card>

          {/* the animal */}
          <Card s={s}>
            <H s={s}>THE ANIMAL</H>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 * s }}>
              <View style={{ width: 260 * s, height: 260 * s, borderRadius: 24 * s, overflow: 'hidden', borderWidth: 2.5 * s, borderColor: COLORS.lime, backgroundColor: 'rgba(16,20,13,0.9)' }}>
                <Image source={{ uri: `${httpsBase}/mposter/${encodeURIComponent(matchId)}`, headers: authHeaders || {} }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.12 * 24 * s }}>CORRECT ANSWER</Text>
                <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: COLORS.lime, includeFontPadding: false, marginTop: 6 * s }}>{String(d.correctText || '—').toUpperCase()}</Text>
                {d.question && d.question.text ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: GREY, marginTop: 10 * s }}>{d.question.text}</Text> : null}
              </View>
            </View>
          </Card>

          {/* answers + times */}
          <Card s={s}>
            <H s={s}>ANSWERS</H>
            <AnswerRow s={s} label="YOU" p={d.you} color={BLUE} />
            <AnswerRow s={s} label={String(d.opp.handle || 'OPPONENT').toUpperCase()} p={d.opp} color="#FF9F43" />
          </Card>

          {/* analytics toggle */}
          <Pressable onPress={() => setAnalytics((a) => !a)} style={{ backgroundColor: analytics ? 'rgba(215,248,74,0.12)' : COLORS.lime, borderWidth: 2 * s, borderColor: COLORS.lime,
            borderRadius: 26 * s, paddingVertical: 34 * s, alignItems: 'center', marginBottom: 30 * s }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 44 * s, color: analytics ? COLORS.lime : '#10140C', letterSpacing: 0.06 * 44 * s }}>{analytics ? 'HIDE ANALYTICS' : 'MATCH ANALYTICS'}</Text>
          </Pressable>

          {analytics ? (<>
            <Card s={s}>
              <H s={s}>MATCH TIMELINE</H>
              {d.timeline.map((e, i) => {
                const mineEv = e.who && e.who === d.you.handle; const c = !e.who ? COLORS.cream : mineEv ? BLUE : '#FF9F43';
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 22 * s, marginBottom: i === d.timeline.length - 1 ? 0 : 26 * s }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={{ width: 34 * s, height: 34 * s, borderRadius: 17 * s, borderWidth: 4 * s, borderColor: 'rgba(245,241,230,0.35)', backgroundColor: c }} />
                      {i < d.timeline.length - 1 ? <View style={{ width: 3 * s, flex: 1, backgroundColor: 'rgba(245,241,230,0.18)', marginTop: 6 * s }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 6 * s }}>
                      <Text style={{ fontFamily: FONTS.mono, fontSize: 26 * s, color: GREY }}>{fmtStamp(e.t)}</Text>
                      <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.creamDim, marginTop: 4 * s }}>
                        {e.who ? <Text style={{ color: COLORS.cream, fontFamily: FONTS.interExtra }}>{e.who} </Text> : null}{e.event}</Text>
                    </View>
                  </View>);
              })}
            </Card>
            <Card s={s}>
              <H s={s}>THE ROUND</H>
              <RoundChart d={d} s={s} />
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: GREY, marginTop: 8 * s }}>
                Both players saw the same clip for {Math.round((d.roundMs || 8000) / 1000)} seconds. Fastest correct lock-in wins; a tie or two wrong answers is a draw.</Text>
            </Card>
            <Card s={s} style={{ borderColor: 'rgba(215,248,74,0.35)' }}>
              <H s={s}>🤖 BOTS</H>
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, lineHeight: 42 * s, color: COLORS.creamDim }}>
                Every opponent is a real person. We don't fill matches with bots, and results are decided by the two lock-in times you see above — nothing else.</Text>
            </Card>
            <Card s={s} style={{ borderColor: 'rgba(215,248,74,0.35)' }}>
              <H s={s}>FAIR PLAY</H>
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, lineHeight: 42 * s, color: COLORS.creamDim }}>
                Your time runs on your phone, from the moment the clip appears to the moment you tap, so network lag never counts against you. The server clocks every round independently and flags any mismatch, every install is verified by Apple's device attestation, and timing patterns are reviewed across matches. If a match looks wrong, tell us from Profile → Help and we'll pull the full log.</Text>
            </Card>
          </>) : null}
        </>) : null}
      </ScrollView>
    </View>);
}
