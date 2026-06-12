// ── RESKIN APP: the new render root (Phase 5b client integration) ───────────
// App.js owns ALL game state, WS handlers and timing logic — byte-identical.
// This file is a pure RENDER LAYER: it receives one bag of live state +
// actions (`g`) from App.js and maps it onto the locked reskin screens.
// Flip `const RESKIN = false` in App.js and the old UI renders untouched.
//
// Money display: 1 credit = 1¢ (DECISIONS Q2). fmtMoney is THE switchable
// formatter (DECISIONS #3) — flip to credits formatting in one place.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import HomeScreen from './HomeScreen';
import QuestionScreen from './QuestionScreen';
import CountdownScreen from './CountdownScreen';
import ResultsScreen from './ResultsScreen';
import WaitingScreen from './WaitingScreen';
import HistoryScreen from './HistoryScreen';
import LeaderboardScreen from './LeaderboardScreen';
import ProfileScreen from './ProfileScreen';
import DepositScreen from './DepositScreen';
import AppShell from './AppShell';
import { COLORS, FONTS, useScale, useSenseFonts } from './theme';

// ── constants ────────────────────────────────────────────────────────────────
const RING_MODE = 'laser';                 // 'laser' | 'fuse' — CJ lean (laser); one const to flip
const TIER_CENTS = [50, 100, 500, 1000];   // canonical ladder (DECISIONS #1) — mirrors server CREDIT_TIER_CENTS
const RAKE = 0.05;                          // shared rake constant (DECISIONS #2)
const TIME_LIMIT = 10000;

export const fmtMoney = (cents) => '$' + (Math.abs(cents || 0) / 100).toFixed(2);
const fmtSigned = (cents) => (cents < 0 ? '-' : '+') + fmtMoney(cents);
const winCents = (stakeCents) => Math.round(stakeCents * 2 * (1 - RAKE));
const fmtSecs = (ms) => (ms == null ? '—' : (Math.min(ms, TIME_LIMIT) / 1000).toFixed(2) + 's');
const stakeLabel = (stakeCents) => `${fmtMoney(stakeCents)} · WIN ${fmtMoney(winCents(stakeCents))}`;
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
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 280 * s, left: 22 * s,
      right: 22 * s, zIndex: 95 }}>
      {banners.map((b) => {
        const c = b.result === 'win' ? COLORS.lime : b.result === 'loss' ? '#FF5A48' : COLORS.cream;
        return (
          <Pressable key={b.id} onPress={() => onPress(b)}
            style={{ backgroundColor: 'rgba(16,20,13,0.94)', borderWidth: 2 * s, borderColor: c,
              borderRadius: 24 * s, paddingVertical: 24 * s, paddingHorizontal: 36 * s,
              marginBottom: 14 * s, flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center' }}>
            <Text style={{ color: c, fontFamily: FONTS.interExtra, fontSize: 32 * s,
              letterSpacing: 0.05 * 32 * s }}>{String(b.text || '').toUpperCase()}</Text>
            <Text style={{ color: COLORS.creamDim, fontFamily: FONTS.interBold,
              fontSize: 26 * s }}>VIEW ›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// minimal queue-flash state (DECISIONS #23: no radar screen — async matching
// typically resolves <1s; this is just the gap before `async-question`)
function FindingFlash({ onCancel }) {
  const s = useScale();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 110 * s, color: COLORS.wordmark,
        includeFontPadding: false }}>MATCHING…</Text>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.creamDim,
        letterSpacing: 0.1 * 30 * s, marginTop: 20 * s }}>LOCKING IN A LIVE OPPONENT</Text>
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
  const [cdOverlay, setCdOverlay] = useState(false);     // countdown takeover on top of question
  const [serverInfo, setServerInfo] = useState(null);    // /api/credits/me account (member_since, net_lifetime_cents, dailyBonus)
  const [serverStats, setServerStats] = useState(null);  // /history stats {accuracy, current_streak, ...}
  const [cancelledRows, setCancelledRows] = useState([]); // /history cancelled[]
  const [lb, setLb] = useState({ rows: [], you: null });
  const [now, setNow] = useState(Date.now());            // 1s tick for pending lockout rings
  const dailyShown = useRef(false);

  // make sure the selected stake is on the canonical ladder (App default is 10)
  useEffect(() => { if (!TIER_CENTS.includes(g.stake)) g.setStake(TIER_CENTS[0]); }, []);

  // COUNTDOWN CONTRACT: question timer starts at 2400ms (server COUNTDOWN_MS),
  // not when the GO flash finishes (~3200ms). App.js starts its 50ms tick the
  // moment `countdown` flips false — so flip it at exactly 2400ms and keep the
  // CountdownScreen overlay rendered until its own fade-out completes.
  useEffect(() => {
    if (g.countdown && g.mode === 'play') {
      setCdOverlay(true);
      const t = setTimeout(() => g.setCountdown(false), 2400);
      return () => clearTimeout(t);
    }
  }, [g.countdown, g.mode]);

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
            g.showToast(`+${fmtMoney(d.dailyBonus.amountCents)} DAILY CHECK-IN`);
          }
        }
      } catch (e) {}
      try {
        const r = await fetch(`${g.httpsBase}/history/x?limit=200&token=${encodeURIComponent(tok)}`);
        const d = await r.json();
        if (d && d.stats) setServerStats(d.stats);
        if (d && Array.isArray(d.cancelled)) setCancelledRows(d.cancelled);
      } catch (e) {}
    })();
  }, [g.displayName]); // re-run once the account registers / handle syncs

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
  const streakVal = (serverStats && serverStats.current_streak != null)
    ? serverStats.current_streak : streakFromLog(g.matchLog);
  const handle = g.displayName || g.myName();
  const signedIn = !!g.authEmail;
  const pendingCount = Object.keys(g.pending || {}).length;
  const tierIdx = Math.max(0, TIER_CENTS.indexOf(g.stake));
  const stakeCents = TIER_CENTS[tierIdx];
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
        if (m && m.result === 'loss') return { badge: 'loss', label: 'STAKE', title: `STAKED · ${vs(m)}`, sub: `LOST · ${times(m)}` };
        if (m && m.result === 'win') return { badge: 'stake', title: `STAKED · ${vs(m)}`, sub: 'WON — SEE PAYOUT' };
        if (m) return { badge: 'stake', title: `STAKED · ${vs(m)}`, sub: 'DRAW — STAKE RETURNED' };
        if (matchId && cancelledIds.has(matchId)) return { badge: 'stake', title: 'STAKED · VS ???', sub: 'CANCELLED — SEE REFUND' };
        if (matchId && g.pending && g.pending[matchId]) return { badge: 'stake', title: 'STAKED · VS ???', sub: 'PENDING — WAITING FOR OPPONENT' };
        return { badge: 'stake', title: 'STAKED', sub: '' };
      }
      if (type === 'win') return m ? { badge: 'win', label: 'PAYOUT', title: `WON ${vs(m)}`, sub: times(m) }
        : { badge: 'win', label: 'PAYOUT', title: 'WON', sub: '' };
      if (type === 'refund') return (m && m.result === 'draw')
        ? { badge: 'draw', title: `DRAW ${vs(m)}`, sub: 'STAKE RETURNED' }
        : { badge: 'refund', title: 'REFUNDED', sub: 'MATCH CANCELLED / EXPIRED' };
      if (type === 'deposit') return { badge: 'deposit', title: 'DEPOSIT', sub: 'CARD DEPOSIT' };
      if (type === 'signup_bonus') return { badge: 'bonus', title: 'BONUS', sub: 'WELCOME CREDITS' };
      if (type === 'daily_checkin') return { badge: 'bonus', title: 'BONUS', sub: 'DAILY CHECK-IN' };
      if (type === 'bonus') return { badge: 'bonus', title: 'BONUS', sub: '' };
      // unknown / legacy types render honestly with their raw type
      return { badge: 'other', title: String(type || 'credit').toUpperCase().replace(/_/g, ' '), sub: '' };
    };
    const rows = [];
    if (g.serverLedger && g.serverLedger.length) {
      // server ledger = source of truth: balance_after per row, survives devices
      g.serverLedger.forEach((t) => {
        rows.push({ ts: t.created_at ? new Date(t.created_at).getTime() : 0,
          ...enrich(t.type, t.match_id),
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
          amount: fmtSigned(t.amount || 0), balance: fmtMoney(run) });
        run -= (t.amount || 0);
      });
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 250);
  }, [g.matchLog, g.ledger, g.serverLedger, g.balance, g.pending, cancelledRows]);

  const pendingRows = useMemo(() => Object.entries(g.pending || {}).map(([mid, d]) => {
    const left = d.ts ? Math.ceil((120000 - (now - d.ts)) / 1000) : 0;
    return { mid, yourTime: d.myTime != null ? fmtSecs(d.myTime) : '—',
      stake: fmtMoney(d.stake || 0), lockoutSec: left > 0 ? left : null };
  }), [g.pending, now]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: COLORS.forest }} />;

  /* ── route the live state machine onto the reskin screens ── */
  let body = null;

  if (g.mode === 'joining') {
    body = <FindingFlash onCancel={g.cancelOnline} />;
  } else if (g.mode === 'play' && g.q) {
    const answered = g.picked !== null;
    if (answered && g.online && !g.isChallenge) {
      // ghost play: dedicated waiting takeover (DECISIONS Q6 FINAL)
      body = (
        <WaitingScreen streak={streakVal} balance={balanceTxt} handle={handle} signedIn={signedIn}
          lockedTime={g.picked === -1 ? '—' : fmtSecs(g.myTime)}
          stakeText={stakeLabel(g.stakeRef.current || stakeCents)}
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
          stake={g.online ? stakeLabel(g.stakeRef.current || stakeCents) : 'PRACTICE · FREE'}
          streak={streakVal} balance={balanceTxt} ringMode={RING_MODE}
          secondsLeft={g.countdown || cdOverlay ? 10 : (answered ? secLeft : null)}
          onAnswer={(i) => g.submit(i)} />
      );
    }
    // NOTE: timeout submit stays App.js's 50ms tick (submit(-1) at 10s) — the
    // ring here is display-only and never feeds clientTime (gap analysis #9).
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
    const balBefore = r === 'win' ? g.balance - payC : r === 'draw' ? g.balance - stkC : g.balance;
    const correctTxt = g.q.correctIdx != null ? g.q.options[g.q.correctIdx] : '—';
    body = (
      <ResultsScreen key={'res' + String(g.matchId || '')}
        outcome={outcome}
        you={{ answer: g.picked === -1 ? 'TIMED OUT' : g.q.options[g.picked], time: youT, correct: myCorrect }}
        opp={{ answer: g.comp.isCorrect ? correctTxt
            : (g.comp.answer == null || g.comp.answer === -1 ? 'TIMED OUT' : (g.q.options[g.comp.answer] || 'WRONG')),
          time: oppT, correct: g.comp.isCorrect }}
        correctAnswer={correctTxt}
        stake={stkC / 100} payout={payC / 100} balanceBefore={Math.max(0, balBefore) / 100}
        streak={streakVal}
        record={g.online
          ? { w: g.onlineRec.wins, d: g.onlineRec.draws, l: g.onlineRec.losses }
          : { w: g.rec.wins, d: g.rec.draws, l: g.rec.losses }}
        photo={typeof g.q.image === 'string' ? { uri: g.q.image } : g.q.image}
        onPlayAgain={() => g.playAgain()} onHome={g.goHome} />
    );
  } else if (route === 'deposit') {
    body = (
      <AppShell streak={streakVal} balance={balanceTxt} handle={handle} signedIn={signedIn}
        onSignIn={() => { setRoute('tabs'); g.setTab('profile'); }}
        pendingCount={pendingCount} onPendingPress={() => { setRoute('tabs'); g.setTab('history'); }}
        activeTab="profile" onTab={(t) => { setRoute('tabs'); g.setTab(t); }}
        onAddFunds={() => setRoute('deposit')}>
        <DepositScreen balance={balanceTxt}
          onNotify={() => { g.showToast("YOU'RE ON THE LIST — FREE COINS AT LAUNCH"); setRoute('tabs'); g.setTab('home'); }} />
      </AppShell>
    );
  } else if (g.tab === 'home') {
    body = (
      <HomeScreen streak={streakVal} balance={balanceTxt} handle={handle} signedIn={signedIn}
        onSignIn={() => g.setTab('profile')}
        tiers={TIER_CENTS.map(fmtMoney)} selectedTier={tierIdx}
        winAmount={'WIN ' + fmtMoney(winCents(stakeCents))}
        onSelectTier={(i) => g.setStake(TIER_CENTS[i])}
        playDisabled={insufficient} insufficientLabel="NOT ENOUGH BALANCE — TAP + TO ADD FUNDS"
        onPlay={() => { if (!insufficient) g.startPaidOnline(); }}
        onPractice={g.startPractice}
        pendingCount={pendingCount} onPendingPress={() => g.setTab('history')}
        onAddFunds={() => setRoute('deposit')}
        activeTab="home" onTab={(t) => g.setTab(t)} />
    );
  } else {
    let screen = null;
    if (g.tab === 'history') {
      screen = (
        <HistoryScreen pending={pendingRows} feed={feed}
          practice={{ w: g.rec.wins, l: g.rec.losses, d: g.rec.draws, log: [] }}
          onCancelPending={(row) => row && row.mid && g.cancelPendingMatch(row.mid)}
          onStartPractice={g.startPractice} />
      );
    } else if (g.tab === 'leaderboard') {
      screen = <LeaderboardScreen rows={lb.rows} yourName={g.myName()} />;
    } else { // profile
      const played = g.onlineRec.wins + g.onlineRec.losses + g.onlineRec.draws;
      const winPct = played ? Math.round((g.onlineRec.wins / played) * 100) : 0;
      screen = (
        <ProfileScreen signedIn={signedIn} handle={handle}
          memberSince={serverInfo && serverInfo.member_since ? monthYear(serverInfo.member_since)
            : (g.authSince ? monthYear(g.authSince) : '—')}
          stats={{ played, w: g.onlineRec.wins, l: g.onlineRec.losses, d: g.onlineRec.draws,
            winPct, streak: streakVal,
            accuracy: serverStats && serverStats.accuracy != null ? Math.round(serverStats.accuracy) : null }}
          netLifetime={fmtSigned(serverInfo && serverInfo.net_lifetime_cents != null
            ? serverInfo.net_lifetime_cents
            : (g.ledger || []).reduce((a, t) => a + (t.amount || 0), 0))}
          balance={balanceTxt} soundsOn={g.sound} version="v1.0.0 · reskin"
          onToggleSounds={() => g.setSound((x) => !x)}
          onDeposit={() => setRoute('deposit')}
          email={g.signinEmail} onChangeEmail={g.setSigninEmail}
          codeStr={g.signinCode} onChangeCode={g.setSigninCode}
          step={g.signinStep} busy={g.signinBusy}
          onSendCode={g.sendCode} onVerify={g.verifyCode} onSignOut={g.signOutAuth} />
      );
    }
    body = (
      <AppShell streak={streakVal} balance={balanceTxt} handle={handle} signedIn={signedIn}
        onSignIn={() => g.setTab('profile')}
        pendingCount={pendingCount} onPendingPress={() => g.setTab('history')}
        activeTab={g.tab === 'home' ? 'home' : g.tab} onTab={(t) => g.setTab(t)}
        onAddFunds={() => setRoute('deposit')}>
        {screen}
      </AppShell>
    );
  }

  const inMatch = g.mode === 'play' || g.mode === 'joining';
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest }}>
      {body}
      {/* countdown takeover (no header, CJ confirmed) — overlays the question
          screen so the 2400ms handoff fade plays over the live question */}
      {cdOverlay && g.mode === 'play' && g.q ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80 }}>
          <CountdownScreen stakeLabel={g.online ? stakeLabel(g.stakeRef.current || stakeCents) : 'PRACTICE · FREE'}
            onDone={() => setCdOverlay(false)} />
        </View>
      ) : null}
      {/* background-result banners (never during the countdown/question takeover) */}
      {!inMatch || !cdOverlay ? (
        <ReskinBanners banners={g.banners}
          onPress={(b) => { g.setBanners((prev) => prev.filter((x) => x.id !== b.id)); g.navTo('history'); }} />
      ) : null}
      {g.toast ? <ReskinToast text={String(g.toast).toUpperCase()} kind={g.toastKind} /> : null}
      {g.notice && !g.mode ? <ReskinToast text={String(g.notice).toUpperCase()} /> : null}
    </View>
  );
}
