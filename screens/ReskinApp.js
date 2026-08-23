// ── RESKIN APP: the new render root (Phase 5b client integration) ───────────
// App.js owns ALL game state, WS handlers and timing logic — byte-identical.
// This file is a pure RENDER LAYER: it receives one bag of live state +
// actions (`g`) from App.js and maps it onto the locked reskin screens.
// Flip `const RESKIN = false` in App.js and the old UI renders untouched.
//
// Money display: 1 credit = 1¢ (DECISIONS Q2). fmtMoney is THE switchable
// formatter (DECISIONS #3) — flip to credits formatting in one place.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Alert, AppState, TextInput, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen, { BUILD_TAG } from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import { ROUND_S } from './components/TimerRing'; // B76: single source of round length (8s)
import CountdownScreen from './CountdownScreen';
import ResultsScreen from './ResultsScreen';
import WaitingScreen from './WaitingScreen';
import { useVideoPlayer } from 'expo-video'; // B90: ONE shared clip player lives here so the clip survives question->waiting->results
import HistoryScreen from './HistoryScreen';
import LeaderboardScreen from './LeaderboardScreen';
import ProfileScreen from './ProfileScreen';
import DepositScreen from './DepositScreen';
import AppShell from './AppShell';
import { avatarSource, DEFAULT_AVATAR_KEY } from './avatars';
import { COLORS, FONTS, useScale, useSenseFonts, getSafeTop } from './theme';

// DOB MODAL (B44, B48): shown when the server answers needDob — first DEPOSIT (universal
// 18+ floor) or a paid queue for accounts that got credits before the floor. Pure input
// UI — validation for a REAL date here; the server re-validates and is the authority.
// One-time: DOB is immutable server-side. Terms checkbox text is a placeholder until CJ
// supplies the final terms copy.
// B51: when CJ supplies the hosted terms URL, set it here — the link goes live, no other change.
const TERMS_URL = '';
function DobModal({ error, onSubmit, onCancel }) {
  const s = useScale();
  const [mm, setMm] = useState(''); const [dd, setDd] = useState(''); const [yy, setYy] = useState('');
  const [localErr, setLocalErr] = useState(null);
  const [confirm, setConfirm] = useState(null); // {y,m,d} under review — B47 typo guard (DOB is one-time)
  const [agreed, setAgreed] = useState(false);  // B48: terms checkbox on the review step gates CONFIRM
  const ddRef = useRef(null); const yyRef = useRef(null);
  const box = { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14 * s, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 30 * s, textAlign: 'center', paddingVertical: 20 * s };
  function go() {
    const m = Number(mm), d = Number(dd), y = Number(yy);
    const now = new Date();
    if (!m || !d || !y || yy.length !== 4 || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > now.getFullYear()) { setLocalErr('Enter a valid date of birth.'); return; }
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || dt > now) { setLocalErr('Enter a valid date of birth.'); return; }
    setLocalErr(null);
    setConfirm({ y, m, d });
  }
  const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function send() {
    onSubmit(String(confirm.y) + '-' + String(confirm.m).padStart(2, '0') + '-' + String(confirm.d).padStart(2, '0'));
  }
  const err = localErr || error;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90,
      backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 * s }}>
      <View style={{ width: '100%', backgroundColor: COLORS.forest, borderRadius: 28 * s, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)', paddingVertical: 44 * s, paddingHorizontal: 40 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 34 * s, color: COLORS.cream, textAlign: 'center', letterSpacing: 1 }}>VERIFY YOUR AGE</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 20 * s, lineHeight: 28 * s, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 14 * s }}>
          {confirm ? 'Double-check: this cannot be changed later.' : 'You must be 18 years or older to play. One time only.'}</Text>
        {confirm ? (
          <View style={{ marginTop: 32 * s, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 19 * s, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 }}>YOU ENTERED</Text>
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 31 * s, color: COLORS.cream, marginTop: 10 * s, textAlign: 'center' }}>
              {MONTHS[confirm.m - 1]} {confirm.d}, {confirm.y}</Text>
            <Pressable onPress={() => setAgreed(v => !v)} hitSlop={14} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 26 * s, paddingVertical: 14 * s, paddingHorizontal: 4 * s }}>
              <View style={{ width: 52 * s, height: 52 * s, borderRadius: 13 * s, borderWidth: 3, borderColor: agreed ? COLORS.lime : 'rgba(255,255,255,0.45)', backgroundColor: agreed ? COLORS.lime : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 20 * s }}>
                {agreed ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 34 * s, color: '#0A0A0A' }}>{'\u2713'}</Text> : null}
              </View>
              <Text style={{ fontFamily: FONTS.interBold, fontSize: 25 * s, color: 'rgba(255,255,255,0.85)', flexShrink: 1, lineHeight: 35 * s }}>I confirm this is accurate and accept the {''}
                <Text onPress={TERMS_URL ? () => Linking.openURL(TERMS_URL).catch(() => {}) : undefined}
                  style={{ color: COLORS.lime, textDecorationLine: 'underline' }}>Terms of Service</Text></Text>
            </Pressable>
          </View>
        ) : (
        <View style={{ flexDirection: 'row', marginTop: 32 * s }}>
          <TextInput style={[box, { flex: 1 }]} value={mm} onChangeText={(t) => { const v = t.replace(/\D/g, '').slice(0, 2); setMm(v); if (v.length === 2 && ddRef.current) ddRef.current.focus(); }}
            placeholder="MM" placeholderTextColor="rgba(255,255,255,0.35)" keyboardType="number-pad" maxLength={2} />
          <TextInput ref={ddRef} style={[box, { flex: 1, marginHorizontal: 14 * s }]} value={dd} onChangeText={(t) => { const v = t.replace(/\D/g, '').slice(0, 2); setDd(v); if (v.length === 2 && yyRef.current) yyRef.current.focus(); }}
            placeholder="DD" placeholderTextColor="rgba(255,255,255,0.35)" keyboardType="number-pad" maxLength={2} />
          <TextInput ref={yyRef} style={[box, { flex: 1.5 }]} value={yy} onChangeText={(t) => setYy(t.replace(/\D/g, '').slice(0, 4))}
            placeholder="YYYY" placeholderTextColor="rgba(255,255,255,0.35)" keyboardType="number-pad" maxLength={4} />
        </View>
        )}
        {err ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 19 * s, color: '#FF7A6B', textAlign: 'center', marginTop: 18 * s }}>{err}</Text> : null}
        <Pressable onPress={confirm ? (agreed ? send : undefined) : go} style={{ backgroundColor: COLORS.lime, borderRadius: 22 * s, paddingVertical: 26 * s, alignItems: 'center', marginTop: 30 * s, opacity: confirm && !agreed ? 0.4 : 1 }}>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: '#0A0A0A', letterSpacing: 1.5 }}>{confirm ? 'CONFIRM' : 'CONTINUE'}</Text>
        </Pressable>
        {confirm ? (
          <Pressable onPress={() => { setConfirm(null); setAgreed(false); }} hitSlop={12} style={{ alignItems: 'center', marginTop: 18 * s, paddingVertical: 14 * s }}>
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 27 * s, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>EDIT DATE</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onCancel} hitSlop={12} style={{ alignItems: 'center', marginTop: 14 * s, paddingVertical: 14 * s }}>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 27 * s, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>CANCEL</Text>
        </Pressable>
      </View>
    </View>
  );
}

// AUTH GATE (2026-06-19, CJ strict model): not signed in -> gated tabs show this
// prompt instead of personal data. Practice stays open; balance/tiers/Play/history gated.
function SignInGate({ onSignIn, label }) {
  const s = useScale();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 64 * s }}>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 34 * s, lineHeight: 44 * s, color: COLORS.cream, textAlign: 'center', marginBottom: 36 * s }}>{label}</Text>
      <Pressable onPress={onSignIn} style={{ backgroundColor: COLORS.lime, borderRadius: 22 * s, paddingVertical: 28 * s, paddingHorizontal: 64 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 34 * s, color: '#0A0A0A', letterSpacing: 1.5 }}>SIGN IN</Text>
      </Pressable>
    </View>
  );
}

// ── constants ────────────────────────────────────────────────────────────────
const RING_MODE = 'laser';                 // 'laser' | 'fuse' — CJ lean (laser); one const to flip
// FIXED-PRIZE LADDER (phase 2, 2026-07-16) — mirrors server lib/economy.js TIERS.
// Each tier: fixed pre-announced prize (1.9x entry) + flat fixed fee (0.1x entry);
// prize + fee === 2 x entry, always. Indices are append-only wire values — legacy
// 3 ($5) and 4 ($100) are retired, never reused, hidden from the picker but still
// recognized so old history rows show correct dollars. Locked tiers render greyed
// "SOON" until an admin flips them server-side — no OTA needed: the ladder
// refreshes from GET /api/tiers on app open; this table is the offline fallback.
const TIER_LADDER = [
  { index: 1,  entryCents: 50,    prizeCents: 95,    enabled: true  },
  { index: 2,  entryCents: 100,   prizeCents: 190,   enabled: true  },
  { index: 5,  entryCents: 200,   prizeCents: 380,   enabled: true  },
  { index: 6,  entryCents: 400,   prizeCents: 760,   enabled: true  },
  { index: 7,  entryCents: 800,   prizeCents: 1520,  enabled: true  },
  { index: 8,  entryCents: 1600,  prizeCents: 3040,  enabled: false },
  { index: 9,  entryCents: 3200,  prizeCents: 6080,  enabled: false },
  { index: 10, entryCents: 6400,  prizeCents: 12160, enabled: false },
  { index: 11, entryCents: 12800, prizeCents: 24320, enabled: false },
];
const LEGACY_CENTS = [500, 10000];          // retired tiers 3/4 — display-only for old history rows
let LIVE_LADDER = null;                     // set from GET /api/tiers; module-level so it survives remounts
const ladder = () => LIVE_LADDER || TIER_LADDER;
const firstEnabled = (l) => (l.find((t) => t.enabled) || l[0]).entryCents;
const tierFor = (cents) => ladder().find((t) => t.entryCents === cents);
const TIME_LIMIT = 8000; // 2026-08-22 (CJ): 8s round (match server TIME_LIMIT_MS)
// WAITING-SCREEN GRACE (bug fix 2026-06-13): after answering a paid online match
// DON'T jump straight to the WaitingScreen takeover. Hold this long on the frozen
// question ("locked / revealing") first. In the common ghost-join case the
// `async-result` lands within this window → App.js flips mode to 'results' and we
// route to ResultsScreen, so the misleading "AN OPPONENT IS OUT THERE / PLAY AGAIN"
// takeover never appears. Only if NO result arrives in this window (true pending /
// no opponent yet) does the WaitingScreen show. ~matches the original UI, which
// stayed on the question and only surfaced actions at +4s. Purely a render gate —
// the scored clientTime (App.js submit) is untouched.
// CJ 2026-07-11 (B35): match PRACTICE mode's rhythm — practice holds the frozen
// question 800ms then fades to results (App.js submit: fadeTo(...) at 800). Online
// uses the same 800ms hold, then fades to the WaitingScreen (its mount fade) if no
// result arrived. No perceptible pause, one continuous motion, both modes feel identical.
const WAIT_GRACE_MS = 800;
const WAIT_RESULT_CAP_MS = 5000; // B59: until the server CONFIRMS a real wait (async-waiting -> g.oppPending), hold the frozen question up to this long — an instant settle (rival already answered) lands well inside it, so no YOU-LOCKED flash before results. If confirmation AND result both vanish, the WaitingScreen still appears at the cap.

export const fmtMoney = (cents) => '$' + (Math.abs(cents || 0) / 100).toFixed(2);
const fmtSigned = (cents) => (cents < 0 ? '-' : '+') + fmtMoney(cents);
export const winCents = (stakeCents) => { const t = tierFor(stakeCents); return t ? t.prizeCents : Math.round((stakeCents || 0) * 2 * 0.95); }; // fixed prize from ladder; fallback keeps legacy $5/$100 history rows correct
const fmtSecs = (ms) => (ms == null ? '—' : (Math.min(ms, TIME_LIMIT) / 1000).toFixed(2) + 's');
const stakeLabel = (stakeCents) => `${fmtMoney(stakeCents)} · WIN ${fmtMoney(winCents(stakeCents))}`;
// BUG 1 FIX (2026-06-13): the PENDING card must show the TRUE staked tier, not the raw
// client `stakeRef.current`, which can drift OFF the ladder — e.g. the PostHog
// `default-stake=test` flag sets it to 25, so the card rendered fmtMoney(25)=$0.25 for a
// real $0.50 (tier 1) stake. The server maps any off-ladder value to tier 1
// (`RESKIN_TIER_BY_CENTS[..] || 1`) and escrows THAT, so mirror it: known ladder value
// passes through, any other non-zero value snaps to tier 1. 0 = 'stake unknown'
// (server-hydrated open game the client never saw the tier for) — leave it untouched.
const snapStakeCents = (c) => (!c ? 0 : (tierFor(c) || LEGACY_CENTS.includes(c)) ? c : ladder()[0].entryCents);
const monthYear = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch (e) { return '—'; } };

function authToken(g) {
  return (g.supabaseTokenRef && g.supabaseTokenRef.current) ||
    (g.accountRef && g.accountRef.current && g.accountRef.current.token) || null;
}

// online win streak, newest-first matchLog (interim client-derived, DECISIONS #5/Q9)
function streakFromLog(matchLog) {
  let n = 0;
  for (const m of matchLog || []) { if (m.result === 'win') n++; else break; }
  return n;
}

// ── toast + background-result banners (reskin-styled, DECISIONS #24) ─────────
function ReskinToast({ text, kind = 'info' }) {
  const s = useScale();
  const err = kind === 'error';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 180 * s, left: 0, right: 0,
      alignItems: 'center', zIndex: 90 }}>
      <View style={{ backgroundColor: 'rgba(16,20,13,0.94)', borderWidth: 1.5 * s,
        borderColor: err ? '#FF5A48' : COLORS.stakeBorder, borderRadius: 30 * s,
        paddingVertical: 22 * s, paddingHorizontal: 44 * s, maxWidth: '88%' }}>
        <Text style={{ color: err ? '#FF5A48' : COLORS.lime, fontFamily: FONTS.interExtra, fontSize: 32 * s,
          letterSpacing: 0.06 * 32 * s, textAlign: 'center' }}>{text}</Text>
      </View>
    </View>
  );
}

function ReskinBanners({ banners, onPress }) {
  const s = useScale();
  if (!banners || banners.length === 0) return null;
  // B63 (2026-07-27, CJ): sticky bar pinned to the VERY top of the app (was a floating
  // card at 280*s). One dark slab extends under the status bar (getSafeTop() added RAW
  // per theme.js contract); win banners show the AMOUNT WON from the fixed-prize ladder
  // ("WON $0.95"), loss/draw keep their vs-name text. Display is 1s (App.js pushBanner),
  // so the VIEW cta is gone — a tap still deep-links to history. zIndex above toast (90)
  // and countdown (80) so it is never buried.
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0,
      zIndex: 120, paddingTop: getSafeTop(), backgroundColor: 'rgba(16,20,13,0.96)' }}>
      {banners.map((b) => {
        const c = b.result === 'win' ? COLORS.lime : b.result === 'loss' ? '#FF5A48' : COLORS.cream;
        const txt = b.result === 'win' && b.stake ? `WON ${fmtMoney(winCents(b.stake))}` : String(b.text || '').toUpperCase();
        return (
          <Pressable key={b.id} onPress={() => onPress(b)}
            style={{ borderBottomWidth: 2 * s, borderColor: c, paddingVertical: 18 * s,
              paddingHorizontal: 36 * s, alignItems: 'center' }}>
            <Text style={{ color: c, fontFamily: FONTS.interExtra, fontSize: 32 * s,
              letterSpacing: 0.05 * 32 * s }}>{txt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// minimal queue-flash state (DECISIONS #23: no radar screen — async matching
// typically resolves <1s; this is just the gap before `async-question`)
function FindingFlash({ onCancel, noConn }) {
  const s = useScale();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 110 * s, color: COLORS.wordmark,
        includeFontPadding: false }}>{noConn ? 'NO SIGNAL' : 'MATCHING…'}</Text>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.creamDim,
        letterSpacing: 0.1 * 30 * s, marginTop: 20 * s }}>{noConn ? 'NO CONNECTION — RETRYING…' : 'LOCKING IN A LIVE OPPONENT'}</Text>
      <Pressable onPress={onCancel} style={{ marginTop: 60 * s, paddingVertical: 20 * s, paddingHorizontal: 60 * s }}>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.creamDim,
          letterSpacing: 0.1 * 32 * s }}>CANCEL</Text>
      </Pressable>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function ReskinApp({ g }) {
  const fontsReady = useSenseFonts();
  const [route, setRoute] = useState('tabs');            // 'tabs' | 'deposit'
  // B53: chosen animal avatar — device-local (AsyncStorage), never sent to the
  // server. Opponents/leaderboard don't see it; a reinstall resets the choice.
  const [avatarKey, setAvatarKey] = useState(DEFAULT_AVATAR_KEY);
  // B90 (CJ 2026-08-22): the clip must NOT restart at screen changes — it keeps playing
  // from wherever it was and only loops on natural end. Each screen used to create its
  // own useVideoPlayer on the same file (= new player at 0:00 every mount). Now ReskinApp
  // owns the single player and the screens just attach VideoViews to it. B87 contract
  // (volume 0 forever, currentTime=0 at reveal, watchdog) lives on in QuestionScreen.
  const vidPlayer = useVideoPlayer(null, (p) => { p.loop = true; p.muted = false; });
  useEffect(() => { AsyncStorage.getItem('sense_avatar').then((v) => { if (v) setAvatarKey(v); }).catch(() => {}); }, []);
  const pickAvatar = (k) => { setAvatarKey(k); AsyncStorage.setItem('sense_avatar', k).catch(() => {}); };
  // B49 (CJ): age + terms come BEFORE the card form — a declined card must never
  // re-ask them. Gate only on a positive "no DOB" from the server; when in doubt the
  // screen opens normally and the PAY-time needDob backstop still catches it.
  const openDeposit = () => {
    if (!!g.authEmail && g.dobOnFile === false) { g.askDobForDeposit(() => setRoute('deposit')); return; }
    setRoute('deposit');
  };
  const [cdOverlay, setCdOverlay] = useState(false);     // countdown takeover on top of question
  const [serverInfo, setServerInfo] = useState(null);    // /api/credits/me account (member_since, net_lifetime_cents, dailyBonus)
  const [serverStats, setServerStats] = useState(null);  // /history stats {accuracy, current_streak, ...}
  const [cancelledRows, setCancelledRows] = useState([]); // /history cancelled[]
  const [lb, setLb] = useState({ rows: [], you: null });
  const [now, setNow] = useState(Date.now());            // 1s tick for pending lockout rings
  const dailyShown = useRef(false);
  const timingDbg = useRef({});            // ?timedebug=1: { flipTs, goTs, press } per round
  const [graceElapsed, setGraceElapsed] = useState(false); // WAIT_GRACE_MS after answering a paid online match has passed with no result yet

  // ladder sync (phase 2): snap the selected entry onto an ENABLED ladder tier (App
  // default is 10, legacy $5/$100 may linger from old installs), then refresh the
  // ladder from the server so admin tier unlocks reach the picker on next app-open
  // without an OTA. Fetch failure = keep the hardcoded fallback, no error surfaced.
  const [tierList, setTierList] = useState(ladder());
  useEffect(() => {
    const ok = (c) => { const t = tierFor(c); return !!(t && t.enabled); };
    if (!ok(g.stake)) g.setStake(firstEnabled(ladder()));
    fetch(g.httpsBase + '/api/tiers').then((r) => r.json()).then((j) => {
      const rows = (j && j.tiers) || [];
      if (!rows.length) return;
      LIVE_LADDER = rows.map((t) => ({ index: t.index, entryCents: t.entryCents, prizeCents: t.prizeCents, enabled: !!t.enabled }));
      setTierList(LIVE_LADDER);
      if (!ok(g.stakeRef.current)) g.setStake(firstEnabled(LIVE_LADDER));
    }).catch(() => {});
  }, []);

  // COUNTDOWN CONTRACT (rev3 2026-06-12): 4 beats x 600ms (3·2·1·GO, GO is a
  // full opaque beat @1800-2400). Question timer starts at 2400ms (server
  // COUNTDOWN_MS). App.js starts its 50ms tick the moment `countdown` flips
  // false — flip it at exactly 2400ms. The CountdownScreen overlay goes
  // TRANSPARENT + pointerEvents-none at its own 2400ms handoff swap, so the
  // question beneath (mounted throughout, zero mount jank) is visible and
  // tappable from 2400.0ms; a <=150ms residual flash rides over it and onDone
  // (~2550ms) just unmounts the empty overlay.
  useEffect(() => {
    if (g.countdown && g.mode === 'play') {
      setCdOverlay(true);
      timingDbg.current = {};
      // B60: deadline-checked flip (was a single setTimeout — LPM deferred it ~2.1s,
      // revealing the question late while the scored clock stayed honest → integrity draws)
      const t0 = Date.now(); let done = false; let rafId = null;
      const fire = () => { if (done) return; done = true; clearInterval(iv); if (rafId) cancelAnimationFrame(rafId); timingDbg.current.flipTs = Date.now(); g.setCountdown(false); };
      const iv = setInterval(() => { if (Date.now() - t0 >= 2400) fire(); }, 50);
      const rafLoop = () => { if (done) return; if (Date.now() - t0 >= 2400) { fire(); return; } rafId = requestAnimationFrame(rafLoop); };
      rafId = requestAnimationFrame(rafLoop);
      return () => { done = true; clearInterval(iv); if (rafId) cancelAnimationFrame(rafId); };
    }
  }, [g.countdown, g.mode]);

  // WAITING-SCREEN GRACE TIMER (bug fix 2026-06-13). The instant the player answers
  // a paid online match (g.picked set, still mode 'play'), arm a WAIT_GRACE_MS timer.
  // While it's pending we stay on the frozen question; when it fires (no async-result
  // yet) graceElapsed flips true and the WaitingScreen takeover is allowed to show.
  // If async-result lands first, g.mode flips to 'results' here → the condition drops,
  // the timer is cleared, and graceElapsed resets to false for the next round. Keyed
  // on g.matchId so a brand-new round always restarts the grace.
  const answeredOnlineWaiting = g.mode === 'play' && g.picked !== null && g.online && !g.isChallenge;
  useEffect(() => {
    if (!answeredOnlineWaiting) { setGraceElapsed(false); return; }
    setGraceElapsed(false);
    const t = setTimeout(() => setGraceElapsed(true), g.oppPending ? WAIT_GRACE_MS : WAIT_RESULT_CAP_MS); // B59: no confirmed wait yet -> hold for the imminent result instead of flashing the takeover
    return () => clearTimeout(t);
  }, [answeredOnlineWaiting, g.matchId, g.oppPending]);

  // server hydration on open: daily bonus + profile fields (additive server pass 5a)
  useEffect(() => {
    const tok = authToken(g);
    if (!tok) return;
    (async () => {
      try {
        const r = await fetch(`${g.httpsBase}/api/credits/me`, { headers: { Authorization: 'Bearer ' + tok } });
        const d = await r.json();
        if (d && d.account) {
          setServerInfo(d.account);
          if (d.dailyBonus && !dailyShown.current) {
            dailyShown.current = true;
            g.applyCredit(d.dailyBonus.amountCents, 'bonus', 'Daily check-in');
            if (g.serverCredits) g.hydrateHistory(g.displayName || g.myName()); // server granted the bonus — applyCredit is a no-op in credits mode, pull the real balance
            g.showToast(`+${fmtMoney(d.dailyBonus.amountCents)} DAILY CHECK-IN`);
          }
        }
      } catch (e) {}
    })();
  }, [g.displayName, g.authEmail]); // AUDIT #5 (2026-07-02): also re-run when a mid-session sign-in lands — authEmail flips right after supabaseTokenRef is set, so the token-gated early-return above no longer strands the profile (memberSince, lifetime, daily bonus) unhydrated

  // STREAK FIX (2026-07-16, B41): /history stats used to load only in the effect
  // above (app-open / sign-in), so the streak shown in the header and profile froze
  // at that snapshot — live wins after open never moved it. Stats now refresh when a
  // new settled match reaches the client log (live result or reconnect backfill),
  // when the app returns to the foreground (results settled while closed), on rename,
  // and on sign-in. Owns setServerStats/setCancelledRows exclusively.
  const newestMatchId = (g.matchLog && g.matchLog[0] && g.matchLog[0].matchId) || null;
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const tok = authToken(g);
      if (!tok) return;
      try {
        const r = await fetch(`${g.httpsBase}/history/x?limit=200&token=${encodeURIComponent(tok)}`);
        const d = await r.json();
        if (!alive) return;
        if (d && d.stats) setServerStats(d.stats);
        if (d && Array.isArray(d.cancelled)) setCancelledRows(d.cancelled);
      } catch (e) {}
    };
    pull();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') pull(); });
    return () => { alive = false; sub.remove(); };
  }, [newestMatchId, g.displayName, g.authEmail]);

  // leaderboard hydration (records only + you-rank, server pass 5a `?name=`)
  useEffect(() => {
    if (g.tab !== 'leaderboard' || g.mode) return;
    let alive = true;
    (async () => {
      try {
        const nm = g.myName();
        const r = await fetch(`${g.httpsBase}/api/leaderboard?mode=free&limit=20&name=${encodeURIComponent(nm)}`);
        const d = await r.json();
        if (!alive) return;
        const players = Array.isArray(d) ? d : (d.players || []);
        const rows = players.map((p, i) => ({ rank: i + 1, name: p.name, w: p.wins || 0, l: p.losses || 0, d: p.draws || 0 }));
        const you = !Array.isArray(d) && d.you ? d.you : null;
        if (you && you.rank && !rows.some((x) => x.name === nm)) {
          rows.push({ rank: you.rank, name: nm, w: you.wins || 0, l: you.losses || 0, d: you.draws || 0 });
        }
        setLb({ rows, you });
      } catch (e) { if (alive) setLb({ rows: [], you: null }); }
    })();
    return () => { alive = false; };
  }, [g.tab, g.mode]);

  // 1s tick while History is visible (cancel-lockout countdown rings)
  useEffect(() => {
    if (g.tab !== 'history' || g.mode) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [g.tab, g.mode]);

  /* ── derived display values ── */
  const balanceTxt = fmtMoney(g.balance);
  const serverStreak = serverStats ? Number(serverStats.current_streak) : NaN;
  const streakVal = Number.isFinite(serverStreak) ? serverStreak : streakFromLog(g.matchLog);
  const handle = g.displayName || g.myName();
  const signedIn = !!g.authEmail;
  const balanceShown = signedIn ? balanceTxt : '—';
  const pendingCount = Object.keys(g.pending || {}).length;
  const tierIdx = Math.max(0, tierList.findIndex((t) => t.entryCents === g.stake));
  const stakeCents = tierList[tierIdx].entryCents;
  const insufficient = g.balance < stakeCents;

  /* ── history feed: RUNNING LEDGER (CJ spec 2026-06-11). ONE unified row per
        credit movement, enriched with match context by match_id. The credit
        ledger is the single source of truth — match results annotate the money
        rows instead of rendering as a second parallel card (fixes the
        double-refund / +$0.00 refund bugs). ── */
  const feed = useMemo(() => {
    const byId = {};
    (g.matchLog || []).forEach((m) => { if (m.matchId) byId[m.matchId] = m; });
    const cancelledIds = new Set((cancelledRows || []).map((c) => c.match_id).filter(Boolean));
    const vs = (m) => 'VS ' + String(m.opponent || '???').toUpperCase();
    const times = (m) => `${fmtSecs(m.myTime)} VS ${m.oppTime != null ? fmtSecs(m.oppTime) : '—'}`;
    // map a ledger entry (server type + linked match) -> unified row text
    const enrich = (type, matchId) => {
      const m = matchId ? byId[matchId] : null;
      if (type === 'entry') {
        if (m && m.result === 'loss') return { badge: 'loss', label: 'ENTRY', title: `ENTRY · ${vs(m)}`, sub: `LOST · ${times(m)}` };
        if (m && m.result === 'win') return { badge: 'stake', title: `ENTRY · ${vs(m)}`, sub: 'WON — SEE PRIZE' };
        if (m) return { badge: 'stake', title: `ENTRY · ${vs(m)}`, sub: 'DRAW — ENTRY RETURNED' };
        if (matchId && cancelledIds.has(matchId)) return { badge: 'stake', title: 'ENTRY · VS ???', sub: 'CANCELLED — SEE REFUND' };
        if (matchId && g.pending && g.pending[matchId]) return { badge: 'stake', title: 'ENTRY · VS ???', sub: 'PENDING — WAITING FOR OPPONENT' };
        return { badge: 'stake', title: 'ENTRY', sub: '' };
      }
      if (type === 'win') return m ? { badge: 'win', label: 'PRIZE', title: `WON ${vs(m)}`, sub: times(m) }
        : { badge: 'win', label: 'PRIZE', title: 'WON', sub: '' };
      if (type === 'refund') return (m && m.result === 'draw')
        ? { badge: 'draw', title: `DRAW ${vs(m)}`, sub: 'ENTRY RETURNED' }
        : { badge: 'refund', title: 'REFUNDED', sub: 'MATCH CANCELLED / EXPIRED' };
      if (type === 'deposit') return { badge: 'deposit', title: 'DEPOSIT', sub: 'CARD DEPOSIT' };
      if (type === 'signup_bonus') return { badge: 'bonus', title: 'BONUS', sub: 'WELCOME CREDITS' };
      if (type === 'daily_checkin') return { badge: 'bonus', title: 'BONUS', sub: 'DAILY CHECK-IN' };
      if (type === 'bonus') return { badge: 'bonus', title: 'BONUS', sub: '' };
      // unknown / legacy types render honestly with their raw type
      return { badge: 'other', title: String(type || 'credit').toUpperCase().replace(/_/g, ' '), sub: '' };
    };
    // questionIdx (owner 2026-06-16): the matched-match record carries which
    // question this game used; surfaced per row so FeedRow can show the
    // question-image thumbnail. null on non-match rows (deposit/bonus).
    const qIdxOf = (matchId) => { const m = matchId ? byId[matchId] : null; return (m && m.questionIdx != null) ? m.questionIdx : null; };
    const rows = [];
    if (g.serverLedger && g.serverLedger.length) {
      // server ledger = source of truth: balance_after per row, survives devices
      g.serverLedger.forEach((t) => {
        rows.push({ ts: t.created_at ? new Date(t.created_at).getTime() : 0,
          ...enrich(t.type, t.match_id),
          questionIdx: qIdxOf(t.match_id),
          amount: fmtSigned(Number(t.amount)),
          balance: t.balance_after != null ? fmtMoney(Number(t.balance_after)) : '' });
      });
    } else {
      // fallback: local AsyncStorage ledger (newest-first), running balance
      // walked back from the current balance; no match_id locally so the
      // stored label doubles as the context line
      let run = g.balance;
      (g.ledger || []).forEach((t) => {
        const r = enrich(t.type, t.matchId);
        rows.push({ ts: t.ts || 0, ...r, sub: r.sub || String(t.label || '').toUpperCase(),
          questionIdx: qIdxOf(t.matchId),
          amount: fmtSigned(t.amount || 0), balance: fmtMoney(run) });
        run -= (t.amount || 0);
      });
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 250);
  }, [g.matchLog, g.ledger, g.serverLedger, g.balance, g.pending, cancelledRows]);

  // SERVER-AUTHORITATIVE pending timers (fix 2026-06-13): anchor the 2-min
  // cancel-lockout AND the 30-min expiry to the server's created_at (d.createdAt,
  // epoch ms) so neither resets when the app is reopened. `now` ticks every 1s
  // while History is visible. EXPIRY_MS mirrors the server's open-wager window —
  // bump together if the server constant changes.
  const LOCKOUT_MS = 120000;          // 2-min anti-abuse cancel lockout
  const EXPIRY_MS = 30 * 60 * 1000;   // open-wager expiry window (server: queueExpireOld)
  const pendingRows = useMemo(() => Object.entries(g.pending || {}).map(([mid, d]) => {
    const anchor = (d.createdAt != null) ? d.createdAt : d.ts; // server clock first, legacy ts fallback
    const lockLeft = anchor ? Math.ceil((LOCKOUT_MS - (now - anchor)) / 1000) : 0;
    const expLeft  = anchor ? Math.max(0, Math.ceil((EXPIRY_MS - (now - anchor)) / 1000)) : null;
    return { mid, yourTime: d.myTime != null ? fmtSecs(d.myTime) : '—',
      stake: fmtMoney(snapStakeCents(d.stake || 0)),
      createdAt: anchor || null,
      questionIdx: (d.questionIdx != null ? d.questionIdx : null), // owner 2026-06-16: thumbnail on pending cards
      lockoutSec: lockLeft > 0 ? lockLeft : null,
      expirySec: expLeft };
  }), [g.pending, now]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: COLORS.forest }} />;

  /* ── route the live state machine onto the reskin screens ── */
  let body = null;

  if (g.mode === 'joining') {
    body = <FindingFlash onCancel={g.cancelOnline} noConn={g.wsUp === false} />;
  } else if (g.mode === 'play' && g.q) {
    const answered = g.picked !== null;
    if (answered && g.online && !g.isChallenge && graceElapsed) {
      // ghost play, grace window elapsed with no result (true pending / no opponent
      // yet): NOW show the dedicated waiting takeover (DECISIONS Q6 FINAL). If the
      // async-result had arrived within WAIT_GRACE_MS, g.mode would already be
      // 'results' and we'd never reach this branch — so a fast/instant result skips
      // the waiting screen entirely and goes straight to ResultsScreen.
      body = (
        <WaitingScreen noConn={g.wsUp === false} videoUri={g.qVid ? g.qVid.uri : null} player={vidPlayer} streak={streakVal} balance={balanceShown} handle={handle} signedIn={signedIn}
          avatar={avatarSource(avatarKey)}
          lockedTime={g.picked === -1 ? '—' : fmtSecs(g.myTime)}
          stakeText={stakeLabel(g.stakeRef.current || stakeCents)}
          pushOn={g.pushOn !== false} onEnablePush={g.enablePush}
          onPlayAgain={() => { g.setShowActions(false); g.requeueOnline(); }}
          onHistory={() => g.navTo('history')} onHome={g.goHome} />
      );
    } else {
      const secLeft = answered
        ? Math.max(0, (TIME_LIMIT - (g.myTime != null ? g.myTime : TIME_LIMIT)) / 1000)
        : Math.max(0, (TIME_LIMIT - g.elapsed) / 1000);
      body = (
        <QuestionScreen key={String(g.matchId || '') + (g.q.text || '')}
          answers={g.q.options} photo={typeof g.q.image === 'string' ? { uri: g.q.image } : g.q.image}
          videoUri={g.qVid ? g.qVid.uri : null} videoExpected={!!g.qVidExp} player={vidPlayer}
          stake={g.online ? stakeLabel(g.stakeRef.current || stakeCents) : 'PRACTICE · FREE'}
          streak={streakVal} balance={balanceShown} ringMode={RING_MODE} avatar={avatarSource(avatarKey)}
          secondsLeft={g.countdown ? ROUND_S : (answered ? secLeft : null)} // B76: was baked 10 - conceal ring showed 10 then snapped to 8
          startTsRef={g.startRef} timingDbgRef={timingDbg} concealed={!!g.countdown}
          onAnswer={(i, _label, pressTs) => g.submit(i, pressTs)} />
      );
    }
    // NOTE: timeout submit stays App.js's 50ms tick on startRef (submit(-1) at
    // 10s) — the ring here is display-only and never feeds clientTime (gap
    // analysis #9). TIMING FIX (2026-06-11): the ring derives secondsLeft from
    // g.startRef (the exact t0 the scored clientTime subtracts from), and runs
    // from the 2400ms countdown flip even while the GO-fade overlay (cdOverlay)
    // is still on top — previously it started ~800ms late at the overlay's
    // onDone (~3200ms), which is why the ring read ~1s more remaining than the
    // scored time.
  } else if (g.mode === 'results' && g.result && g.q && g.comp) {
    const myCorrect = g.picked === g.q.correctIdx;
    const youT = (g.comp.playerTime != null ? g.comp.playerTime : TIME_LIMIT) / 1000;
    const oppT = (g.comp.time != null ? g.comp.time : TIME_LIMIT) / 1000;
    const r = g.result.result;
    const both = myCorrect && g.comp.isCorrect;
    const gap = Math.abs(youT - oppT);
    const outcome = (r === 'loss' && both && gap > 0 && gap <= 0.25) ? 'nearmiss'
      : (r === 'win' && both && gap > 0 && gap <= 0.25) ? 'closewin' : r;
    const stkC = g.online ? (g.stakeRef.current || 0) : 0;
    const payC = winCents(stkC);
    // AUDIT #4 (2026-07-02): prefer the balance frozen at result-arrival (pre-payout, post-escrow)
    // over live math — g.balance races the settle's async balance fetch, so subtracting the payout
    // from it shows a wrong number whenever the fetch is slow or fails. Fallback = old computation.
    const balBefore = (g.online && g.resultBalBefore != null) ? g.resultBalBefore
      : r === 'win' ? g.balance - payC : r === 'draw' ? g.balance - stkC : g.balance;
    const correctTxt = g.q.correctIdx != null ? g.q.options[g.q.correctIdx] : '—';
    body = (
      <ResultsScreen key={'res' + String(g.matchId || '')}
        outcome={outcome} avatar={avatarSource(avatarKey)}
        you={{ answer: g.picked === -1 ? 'TIMED OUT' : g.q.options[g.picked], time: youT, correct: myCorrect }}
        opp={{ answer: g.comp.isCorrect ? correctTxt
            : (g.comp.answer == null || g.comp.answer === -1 ? 'TIMED OUT' : (g.q.options[g.comp.answer] || 'WRONG')),
          time: oppT, correct: g.comp.isCorrect }}
        correctAnswer={correctTxt}
        stake={stkC / 100} payout={payC / 100} balanceBefore={Math.max(0, balBefore) / 100}
        practice={!g.online}
        streak={streakVal}
        record={g.online
          ? { w: g.onlineRec.wins, d: g.onlineRec.draws, l: g.onlineRec.losses }
          : { w: g.rec.wins, d: g.rec.draws, l: g.rec.losses }}
        photo={typeof g.q.image === 'string' ? { uri: g.q.image } : g.q.image}
        videoUri={g.qVid ? g.qVid.uri : null} videoExpected={!!g.qVidExp} player={vidPlayer}
        reason={g.result.reason || null}
        onPlayAgain={() => g.playAgain()} onHome={g.goHome} />
    );
  } else if (route === 'deposit') {
    body = (
      <AppShell streak={streakVal} balance={balanceShown} handle={handle} signedIn={signedIn}
        avatar={avatarSource(avatarKey)}
        onSignIn={() => { setRoute('tabs'); g.setTab('profile'); }}
        pendingCount={pendingCount} onPendingPress={() => { setRoute('tabs'); g.setTab('history'); }}
        activeTab="profile" onTab={(t) => { setRoute('tabs'); g.setTab(t); }}
        onAddFunds={openDeposit}>
        <DepositScreen
          httpsBase={g.httpsBase}
          supabaseToken={authToken(g)}
          signedInEmail={g.authEmail || ''}
          balance={balanceShown}
          onToast={(t, kind) => g.showToast(t, kind)}
          onRefresh={() => g.hydrateHistory(g.displayName || g.myName())}
          onDone={() => { setRoute('tabs'); g.setTab('home'); }}
          onNeedDob={g.askDobForDeposit} />
      </AppShell>
    );
  } else if (g.tab === 'home') {
    body = (
      <HomeScreen streak={streakVal} balance={balanceShown} handle={handle} signedIn={signedIn}
        avatar={avatarSource(avatarKey)}
        onSignIn={() => g.setTab('profile')}
        tiers={tierList.map((t) => ({ label: fmtMoney(t.entryCents), locked: !t.enabled }))} selectedTier={tierIdx}
        winAmount={'WIN ' + fmtMoney(winCents(stakeCents))}
        onSelectTier={signedIn ? ((i) => { if (tierList[i] && tierList[i].enabled) g.setStake(tierList[i].entryCents); }) : (() => g.setTab('profile'))}
        playDisabled={signedIn && insufficient} insufficientLabel="NOT ENOUGH BALANCE — TAP + TO ADD FUNDS"
        onPlay={signedIn ? (() => { if (!insufficient) g.startPaidOnline(); }) : (() => g.setTab('profile'))}
        onPractice={g.startPractice}
        pendingCount={pendingCount} onPendingPress={() => g.setTab('history')}
        onAddFunds={openDeposit}
        activeTab="home" onTab={(t) => g.setTab(t)} />
    );
  } else {
    let screen = null;
    if (g.tab === 'history') {
      screen = signedIn ? (
        <HistoryScreen pending={pendingRows} feed={feed}
          practice={{ w: g.rec.wins, l: g.rec.losses, d: g.rec.draws, log: (g.pracLog || []).map((e) => ({ result: e.result, animal: e.animal, yourTime: fmtSecs(e.time) })) }}
          onCancelPending={(row) => row && row.mid && g.cancelPendingMatch(row.mid)}
          onStartPractice={g.startPractice} />
      ) : (
        <SignInGate onSignIn={() => g.setTab('profile')} label="Sign in to view your match history" />
      );
    } else if (g.tab === 'leaderboard') {
      screen = <LeaderboardScreen rows={lb.rows} yourName={g.myName()} />;
    } else { // profile
      const played = g.onlineRec.wins + g.onlineRec.losses + g.onlineRec.draws;
      const winPct = played ? Math.round((g.onlineRec.wins / played) * 100) : 0;
      screen = (
        <ProfileScreen signedIn={signedIn} handle={handle}
          avatarKey={avatarKey} onSelectAvatar={pickAvatar}
          memberSince={serverInfo && serverInfo.member_since ? monthYear(serverInfo.member_since)
            : (g.authSince ? monthYear(g.authSince) : '—')}
          stats={{ played, w: g.onlineRec.wins, l: g.onlineRec.losses, d: g.onlineRec.draws,
            winPct, streak: streakVal,
            accuracy: serverStats && serverStats.accuracy != null ? Math.round(serverStats.accuracy) : null }}
          netLifetime={fmtSigned(serverInfo && serverInfo.net_lifetime_cents != null
            ? serverInfo.net_lifetime_cents
            : (g.ledger || []).reduce((a, t) => a + (t.amount || 0), 0))}
          balance={balanceShown} soundsOn={g.sound} version={'v' + ((Constants.expoConfig && Constants.expoConfig.version) || '?') + ' · ' + BUILD_TAG}
          onToggleSounds={() => g.setSound((x) => !x)}
          onDeposit={openDeposit}
          email={g.signinEmail} onChangeEmail={g.setSigninEmail}
          codeStr={g.signinCode} onChangeCode={g.setSigninCode}
          step={g.signinStep} busy={g.signinBusy}
          onSendCode={g.sendCode} onVerify={g.verifyCode} onApple={g.signInWithApple} onSignOut={g.signOutAuth}
          onRename={g.doRename}
          onDeleteAccount={() => {
            // Apple 5.1.1(v): permanent, double-confirmed. Credits are forfeited (free credits era).
            const doIt = async () => { const ok = await g.deleteAccountNow(); if (ok) g.setTab('home'); };
            if (Platform.OS === 'web') { // RN-web Alert is a no-op; confirm() keeps web + snapshot tests working
              if (window.confirm('Delete account? This is permanent. Your handle, match history and remaining credits will be gone forever.')) doIt();
              return;
            }
            Alert.alert('Delete account?',
              'This is permanent. Your handle, match history and remaining credits will be gone forever.',
              [{ text: 'Cancel', style: 'cancel' },
               { text: 'Delete Forever', style: 'destructive', onPress: doIt }]);
          }} />
      );
    }
    body = (
      <AppShell streak={streakVal} balance={balanceShown} handle={handle} signedIn={signedIn}
        avatar={avatarSource(avatarKey)}
        onSignIn={() => g.setTab('profile')}
        pendingCount={pendingCount} onPendingPress={() => g.setTab('history')}
        activeTab={g.tab === 'home' ? 'home' : g.tab} onTab={(t) => g.setTab(t)}
        onAddFunds={openDeposit}>
        {screen}
      </AppShell>
    );
  }

  const inMatch = g.mode === 'play' || g.mode === 'joining';
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest }}>
      {body}
      {/* countdown takeover (no header, CJ confirmed) — opaque (3·2·1·GO
          beats) until exactly 2400ms, then a transparent <=150ms residual
          flash over the live question. box-none + the overlay's own
          pointerEvents none let answer taps (onPressIn stamps) reach
          QuestionScreen from 2400.0ms */}
      {/* render-synchronous mount (2026-07-02 flash fix): g.countdown is true on the FIRST
          paint, before the effect sets cdOverlay — previously the question painted 1+ frames
          uncovered (visible flash on cold start) */}
      {(cdOverlay || g.countdown) && g.mode === 'play' && g.q ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80 }}>
          <CountdownScreen stakeLabel={g.online ? stakeLabel(g.stakeRef.current || stakeCents) : 'PRACTICE · FREE'}
            onDone={() => setCdOverlay(false)}
            onHandoff={(ts) => {
              // rev3 (2026-06-12): anchor t0 to the 2400ms HANDOFF frame — the
              // moment the question the player sees appears (not the GO beat
              // start @1800). If App.js's round-start effect hasn't consumed
              // its t0 yet, the override feeds it; if it already started off
              // the scheduled flip (≤ a frame ago), re-anchor startRef in
              // place — every consumer reads the ref per tick. Guard: if this
              // never fires, the scheduled 2400ms flip remains t0 (old path).
              timingDbg.current.goTs = ts;
              if (g.startOverrideRef) g.startOverrideRef.current = ts;
              if (g.startRef && g.startRef.current && Math.abs(ts - g.startRef.current) < 500) g.startRef.current = ts;
            }} />
        </View>
      ) : null}
      {/* background-result banners — ALWAYS rendered (B65, 2026-07-27, CJ). The old
          `!inMatch || !cdOverlay` gate hid them during the countdown takeover — but in the
          runback flow the previous match settles EXACTLY during the next countdown, and the
          1s banner lived and died entirely behind it (CJ: "the custom bar should show in the
          countdown screen thats the issue"). The bar is a slim top strip at zIndex 120, above
          the countdown (80), so it never blocks gameplay; its container is box-none so answer
          taps pass through everywhere else. */}
      <ReskinBanners banners={g.banners}
        onPress={(b) => { g.setBanners((prev) => prev.filter((x) => x.id !== b.id)); g.navTo('history'); }} />
      {g.dobAsk ? <DobModal error={g.dobErr} onSubmit={g.submitDob} onCancel={g.cancelDob} /> : null}
      {g.toast ? <ReskinToast text={String(g.toast).toUpperCase()} kind={g.toastKind} /> : null}
      {g.notice && !g.mode ? <ReskinToast text={String(g.notice).toUpperCase()} /> : null}
    </View>
  );
}
