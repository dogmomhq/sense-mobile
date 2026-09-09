// ── WITHDRAW (2026-09-09, COINFLOW-INTEGRATION.md 'Phase 3 build spec'; CJ: play-through, winnings only) ──
// The phone never decides anything about money here. It:
//   1. asks the server what is withdrawable (balance − not-yet-played deposits/bonuses) and what Coinflow knows
//      (KYC state, linked bank/card) — GET /api/withdraw/status
//   2. sends the player to Coinflow's HOSTED page for identity + bank/card linking (WebView; SSN never touches us)
//   3. quotes the fee — GET /api/withdraw/quote
//   4. asks for a fresh step-up and POSTs /api/withdraw with the fresh token; the server refuses
//      anything without a re-auth newer than 5 minutes. Email accounts: fresh email code (Supabase OTP).
//      Apple accounts (B129): fresh Apple sign-in re-auth instead — their private-relay email silently
//      drops Supabase's codes (relay forwards only registered sender domains), so email codes never arrive.
// First withdrawal, anything ≥ $500 or a destination linked < 24 h ago waits for CJ's approval — the server says so.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, Platform, Keyboard } from 'react-native';
import WebView from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabaseClient';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';

const LINK_RETURN = 'https://dogmomhq.github.io/sense-legal/linked.html'; // Coinflow bounces here after linking; we intercept it
const RED = '#FF5A48';
const dollars = (c) => '$' + (Math.abs(c) % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
const digits = (s) => (s || '').replace(/\D+/g, '');

function humanError(code, j) {
  switch (code) {
    case 'otp_required': return 'Enter the code we emailed you';
    case 'kyc_required': return 'Finish identity verification first';
    case 'payout_blocked': return 'Payouts are paused on your account — contact support';
    case 'destination_unknown': case 'destination_required': return 'Pick a linked bank or card';
    case 'exceeds_withdrawable': return 'You can withdraw up to ' + dollars((j && j.withdrawableCents) || 0) + ' right now — play through the rest first';
    case 'min_withdrawal': return 'Minimum withdrawal is ' + dollars((j && j.minCents) || 1000);
    case 'cap_daily': return 'Daily withdrawal limit is ' + dollars((j && j.capCents) || 100000);
    case 'cap_weekly': return 'Weekly withdrawal limit is ' + dollars((j && j.capCents) || 300000);
    case 'rate_limited': return 'Too many requests — try again in an hour';
    case 'in_flight': return 'You already have a withdrawal in progress';
    case 'frozen': return 'Your account is under review — contact support';
    case 'withdrawals_disabled': return 'Withdrawals are coming soon';
    case 'quote_unavailable': case 'payouts_unavailable': case 'withdraw_unavailable': return 'Payouts are temporarily unavailable — try again shortly';
    case 'amount_below_fee': return 'That amount is below the transfer fee';
    case 'email_required': case 'auth': return 'Sign in with email to withdraw';
    case 'idempotency_key_required': case 'idempotency_mismatch': return 'Start a new withdrawal';
    default: return code || 'Withdrawal failed — try again';
  }
}
function statusLabel(w) {
  switch (w.status) {
    case 'requested': return 'AWAITING APPROVAL';
    case 'approved': case 'submitted': case 'unknown': return 'SENDING';
    case 'pending': return 'ON ITS WAY';
    case 'paid': return 'PAID';
    case 'failed': return w.refundedAt ? 'RETURNED · CREDITS BACK' : 'FAILED';
    case 'rejected': return 'DECLINED · CREDITS BACK';
    case 'cancelled': return 'CANCELLED · CREDITS BACK';
    default: return String(w.status || '').toUpperCase();
  }
}
const speedLabel = (sp) => sp === 'card' ? 'INSTANT' : sp === 'asap' ? 'INSTANT' : sp === 'same_day' ? 'SAME DAY' : '1–3 DAYS';

export default function WithdrawScreen({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', onToast, onRefresh, onDone }) {
  const s = useScale();
  const [st, setSt] = useState(null);          // /api/withdraw/status
  const [loadErr, setLoadErr] = useState('');
  const [linkUrl, setLinkUrl] = useState(null); // hosted KYC + link page open
  const [dest, setDest] = useState(null);       // chosen destination token
  const [amount, setAmount] = useState('');
  const [speed, setSpeed] = useState('standard');
  const [quote, setQuote] = useState(null);     // { feeCents, netCents }
  const [phase, setPhase] = useState('form');   // form | code | done
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [isApple, setIsApple] = useState(false); // B129: Apple accounts step up via Apple re-auth, not email code
  const idemRef = useRef(null); const inFlightRef = useRef(false); const alive = useRef(true); const quoteTimer = useRef(null);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { (async () => { try { const { data } = await supabase.auth.getSession(); const u = data && data.session && data.session.user; const prov = String((u && u.app_metadata && (u.app_metadata.provider || (u.app_metadata.providers || [])[0])) || ''); if (alive.current) setIsApple(prov === 'apple'); } catch {} })(); }, []);

  const hdr = { Authorization: 'Bearer ' + supabaseToken };
  const load = useCallback(async (fresh) => {
    setLoadErr('');
    try {
      const r = await fetch(`${httpsBase}/api/withdraw/status${fresh ? '?fresh=1' : ''}`, { headers: hdr }); const j = await r.json().catch(() => null);
      if (!alive.current) return;
      if (!r.ok || !j) { setLoadErr(humanError(j && j.error)); return; }
      setSt(j);
      if (j.destinations && j.destinations.length && !j.destinations.find((d) => d.token === dest)) { setDest(j.destinations[0].token); setSpeed(j.destinations[0].kind === 'card' ? 'card' : 'standard'); }
    } catch { if (alive.current) setLoadErr('Network error — pull to retry'); }
  }, [httpsBase, supabaseToken, dest]);
  useEffect(() => { load(false); }, []);

  const cents = Math.round(parseFloat(amount || '0') * 100) || 0;
  const destObj = st && st.destinations ? st.destinations.find((d) => d.token === dest) : null;
  const withdrawable = st ? st.withdrawableCents : 0;
  const minCents = (st && st.limits && st.limits.minCents) || 1000;
  const amountOk = cents >= minCents && cents <= withdrawable;
  const ready = !!(st && st.enabled && st.verified && destObj && amountOk && !busy);

  // fee quote, debounced
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuote(null);
    if (!destObj || !amountOk) return;
    quoteTimer.current = setTimeout(async () => {
      try { const r = await fetch(`${httpsBase}/api/withdraw/quote?token=${encodeURIComponent(destObj.token)}&cents=${cents}`, { headers: hdr }); const j = await r.json().catch(() => null); if (alive.current && j && j.ok) setQuote({ feeCents: j.feeCents, netCents: j.netCents }); } catch {}
    }, 500);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [dest, cents, amountOk]);

  async function openLink() {
    setErr('');
    try { const r = await fetch(`${httpsBase}/api/withdraw/link-url?redirect=${encodeURIComponent(LINK_RETURN)}`, { headers: hdr }); const j = await r.json().catch(() => null); if (!r.ok || !j || !j.url) { setErr(humanError(j && j.error)); return; } setLinkUrl(j.url); }
    catch { setErr('Network error — try again'); }
  }
  function linkDone(msg) { setLinkUrl(null); if (onToast && msg) onToast(msg); load(true); }

  async function submitWithdraw(freshTok) { // shared tail of both step-up paths (email code + Apple re-auth)
    if (!idemRef.current) idemRef.current = Crypto.randomUUID();
    const body = { supabaseToken: freshTok, amountCents: cents, destinationToken: destObj.token, speed, idempotencyKey: idemRef.current };
    let r, j; try { r = await fetch(`${httpsBase}/api/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json().catch(() => ({})); }
    catch { setErr('Network error — try again (the same request will not be sent twice)'); return; }   // idem key kept
    if (r.ok && j && j.ok) { idemRef.current = null; setResult(j); setPhase('done'); if (onRefresh) onRefresh(); load(true); return; }
    if (j && j.error !== 'otp_required') idemRef.current = null;
    if (j && j.error === 'otp_required') { setPhase('code'); }
    setErr(humanError(j && j.error, j)); if (onToast) onToast(humanError(j && j.error, j), 'error');
  }
  async function sendCode() { // step-up entry: Apple accounts → Apple re-auth (B129); email accounts → fresh email code
    if (!ready) return;
    if (isApple) { await confirmWithApple(); return; }
    setErr(''); setBusy(true);
    try { const { error } = await supabase.auth.signInWithOtp({ email: signedInEmail, options: { shouldCreateUser: false } }); if (error) { setErr(error.message || 'Could not send the code'); } else { setPhase('code'); setCode(''); if (onToast) onToast('Code sent to ' + signedInEmail); } }
    catch (e) { setErr((e && e.message) || 'Could not send the code'); }
    setBusy(false);
  }
  // B129: fresh Apple sign-in = the step-up for Apple accounts. Mirrors App.js signInWithApple
  // (proven nonce flow); the server accepts a fresh oauth/idtoken amr entry exactly like an email code.
  async function confirmWithApple() {
    if (inFlightRef.current) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      let AppleAuthentication; try { AppleAuthentication = require('expo-apple-authentication'); } catch (e) { setErr('Apple sign-in not available on this device'); return; }
      const rawNonce = `${Date.now()}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`;
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!cred.identityToken) { setErr('Apple could not confirm — try again'); return; }
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
      if (error || !data || !data.session) { setErr((error && error.message) || 'Apple confirmation failed — try again'); return; }
      await submitWithdraw(data.session.access_token);  // App.js onAuthStateChange picks the new session up too
    } catch (e) {
      if (e && (e.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(String(e && e.message)))) { /* user cancelled — silent */ }
      else setErr((e && e.message) || 'Apple confirmation failed — try again');
    }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  async function confirm() {
    if (inFlightRef.current || code.trim().length < 6) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: signedInEmail, token: code.trim(), type: 'email' });
      if (error || !data || !data.session) { setErr((error && error.message) || 'Invalid code'); return; }
      await submitWithdraw(data.session.access_token);  // App.js onAuthStateChange picks the new session up too
    } catch (e) { setErr((e && e.message) || 'Withdrawal failed'); }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  async function cancel(id) {
    try { const r = await fetch(`${httpsBase}/api/withdraw/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseToken, withdrawalId: id }) }); const j = await r.json().catch(() => ({})); if (onToast) onToast(j.ok ? 'Withdrawal cancelled — credits returned' : humanError(j.error), j.ok ? undefined : 'error'); if (onRefresh) onRefresh(); load(true); } catch {}
  }

  const fieldStyle = { borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)', borderRadius: 16 * s, paddingVertical: 26 * s, paddingHorizontal: 32 * s, color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 34 * s, letterSpacing: 0.04 * 34 * s, backgroundColor: 'rgba(16,20,13,0.55)' };
  const labelStyle = { fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.1 * 24 * s, marginBottom: 14 * s, marginLeft: 6 * s };
  const card = { marginHorizontal: 45 * s, marginBottom: 28 * s, backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s, borderColor: 'rgba(215,248,74,0.35)', borderRadius: RADII.glass * s, padding: 34 * s };
  const chip = (on) => ({ paddingVertical: 24 * s, paddingHorizontal: 28 * s, borderRadius: 16 * s, borderWidth: 2 * s, borderColor: on ? COLORS.lime : 'rgba(215,248,74,0.35)', backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(16,20,13,0.82)' });
  const chipText = (on) => ({ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: on ? COLORS.lime : COLORS.cream, letterSpacing: 0.06 * 28 * s });
  const cta = (enabled) => ({ opacity: enabled ? 1 : 0.5, marginHorizontal: 45 * s, backgroundColor: COLORS.lime, borderRadius: RADII.cta * s, paddingVertical: 44 * s, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 18 * s });
  const ctaText = { fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C', letterSpacing: 0.03 * 60 * s, includeFontPadding: false };

  const speeds = destObj ? (destObj.kind === 'card' ? ['card'] : ['standard', 'same_day', ...(destObj.rtp ? ['asap'] : [])]) : [];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark, textAlign: 'center', includeFontPadding: false, marginBottom: 16 * s }}>WITHDRAW</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 16 * s, marginBottom: 8 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, color: COLORS.cream, letterSpacing: 0.08 * 32 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.cream }}>{balance}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 16 * s, marginBottom: 12 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, color: COLORS.cream, letterSpacing: 0.08 * 32 * s }}>WITHDRAWABLE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.lime }}>{st ? dollars(st.withdrawableCents) : '—'}</Text>
      </View>
      {st && st.owedCents > 0 ? (
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, textAlign: 'center', marginHorizontal: 60 * s, marginBottom: 30 * s, letterSpacing: 0.02 * 24 * s }}>
          Play through {dollars(st.owedCents)} more of your deposits to unlock the rest. Winnings are always withdrawable.</Text>
      ) : <View style={{ height: 30 * s }} />}

      {!st && !loadErr ? <ActivityIndicator color={COLORS.lime} style={{ marginTop: 40 * s }} /> : null}
      {loadErr ? (<Pressable onPress={() => load(true)}><Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: RED, textAlign: 'center', marginHorizontal: 45 * s }}>{loadErr} · TAP TO RETRY</Text></Pressable>) : null}

      {st && !st.enabled ? (
        <View style={card}><Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.cream, textAlign: 'center' }}>Withdrawals are coming soon.</Text></View>
      ) : null}

      {/* Step 1: identity + destination, inside Coinflow's page */}
      {st && st.enabled && (!st.verified || !st.destinations.length) ? (
        <View style={card}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.lime, letterSpacing: 0.06 * 30 * s, marginBottom: 14 * s }}>{!st.verified ? 'ONE-TIME VERIFICATION' : 'LINK A PAYOUT ACCOUNT'}</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 26 * s, color: COLORS.creamDim, lineHeight: 38 * s, marginBottom: 24 * s }}>
            {st.kyc === 'pending' || st.kyc === 'partial-approval' ? 'Your verification is being reviewed. Come back in a bit.'
              : st.kyc === 'rejected' ? 'Verification could not be completed. Contact support.'
              : 'Verify your identity and link a bank account or debit card. Handled securely by Coinflow — Sense never sees your ID or SSN.'}</Text>
          <PressBtn onPress={openLink} style={{ backgroundColor: COLORS.lime, borderRadius: 20 * s, paddingVertical: 30 * s, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: '#10140C', letterSpacing: 0.06 * 36 * s }}>{!st.verified ? 'VERIFY & LINK' : 'LINK BANK OR CARD'}</Text>
          </PressBtn>
        </View>
      ) : null}

      {/* Step 2: the request */}
      {st && st.enabled && st.verified && st.destinations.length && phase !== 'done' ? (
        <View>
          <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>SEND TO</Text>
          <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, flexDirection: 'row', flexWrap: 'wrap', gap: 16 * s }}>
            {st.destinations.map((d) => { const on = d.token === dest; return (
              <PressBtn key={d.token} onPress={() => { setDest(d.token); setSpeed(d.kind === 'card' ? 'card' : 'standard'); }} style={chip(on)}>
                <Text style={chipText(on)}>{d.kind === 'card' ? (d.alias || 'CARD') : 'BANK'} ••{d.last4 || '????'}</Text>
              </PressBtn>); })}
            <PressBtn onPress={openLink} style={chip(false)}><Text style={chipText(false)}>+ ADD</Text></PressBtn>
          </View>

          <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>AMOUNT</Text>
          <View style={{ marginHorizontal: 45 * s, marginBottom: 12 * s, flexDirection: 'row', gap: 16 * s }}>
            <TextInput placeholder={`$${(minCents / 100).toFixed(0)} – ${dollars(withdrawable)}`} placeholderTextColor={COLORS.creamDim} value={amount ? '$' + amount : ''}
              onChangeText={(t) => setAmount((t || '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} keyboardType="decimal-pad" style={[fieldStyle, { flex: 1 }]} editable={phase === 'form'} />
            <PressBtn onPress={() => setAmount((withdrawable / 100).toFixed(2).replace(/\.00$/, ''))} style={[chip(false), { justifyContent: 'center' }]}><Text style={chipText(false)}>MAX</Text></PressBtn>
          </View>
          {amount && !amountOk ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, marginHorizontal: 51 * s, marginBottom: 20 * s }}>{cents < minCents ? 'Minimum ' + dollars(minCents) : 'Up to ' + dollars(withdrawable) + ' is withdrawable right now'}</Text> : <View style={{ height: 20 * s }} />}

          {speeds.length > 1 ? (<>
            <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>SPEED</Text>
            <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, flexDirection: 'row', flexWrap: 'wrap', gap: 16 * s }}>
              {speeds.map((sp) => { const on = sp === speed; return (<PressBtn key={sp} onPress={() => setSpeed(sp)} style={chip(on)}><Text style={chipText(on)}>{speedLabel(sp)}</Text></PressBtn>); })}
            </View></>) : null}

          {quote ? (
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.cream, textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 26 * s }}>
              {quote.feeCents ? `FEE ${dollars(quote.feeCents)} · ` : 'NO FEE · '}YOU RECEIVE <Text style={{ color: COLORS.lime }}>{dollars(quote.netCents != null ? quote.netCents : cents)}</Text> · {speedLabel(speed)}</Text>
          ) : null}

          {phase === 'code' ? (
            <View style={card}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: COLORS.lime, letterSpacing: 0.06 * 28 * s, marginBottom: 12 * s }}>CONFIRM WITH THE CODE WE EMAILED</Text>
              <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 22 * s }}>{signedInEmail}</Text>
              <TextInput placeholder="6-digit code" placeholderTextColor={COLORS.creamDim} value={code} onChangeText={(t) => setCode(digits(t).slice(0, 8))} keyboardType="number-pad" maxLength={8} autoFocus style={fieldStyle} />
              <Pressable onPress={sendCode} disabled={busy} hitSlop={12}><Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim, marginTop: 18 * s, textAlign: 'center' }}>RESEND CODE</Text></Pressable>
            </View>
          ) : null}

          {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: RED, textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 22 * s }}>{err}</Text>) : null}

          {phase === 'form' ? (
            <PressBtn onPress={sendCode} disabled={!ready} style={cta(ready)}>{busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>{amountOk ? 'WITHDRAW ' + dollars(cents) : 'WITHDRAW'}</Text></PressBtn>
          ) : (
            <PressBtn onPress={confirm} disabled={busy || code.trim().length < 6} style={cta(!busy && code.trim().length >= 6)}>{busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>{busy ? 'SENDING…' : 'CONFIRM ' + dollars(cents)}</Text></PressBtn>
          )}
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.04 * 22 * s, marginTop: 26 * s, marginHorizontal: 45 * s }}>
            MIN {dollars(minCents)} · {dollars((st.limits && st.limits.dayCents) || 100000)} PER DAY · FIRST WITHDRAWAL AND ANYTHING OVER {dollars((st.limits && st.limits.approvalCents) || 50000)} IS REVIEWED WITHIN 24H</Text>
        </View>
      ) : null}

      {phase === 'done' && result ? (
        <View style={card}>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: COLORS.lime, textAlign: 'center', includeFontPadding: false, marginBottom: 14 * s }}>{result.needsApproval ? 'SENT FOR REVIEW' : 'ON ITS WAY'}</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 26 * s, color: COLORS.creamDim, textAlign: 'center', lineHeight: 38 * s }}>
            {result.needsApproval ? `${dollars(result.amountCents)} is reserved. We review first withdrawals, new payout accounts and anything over $500 within 24 hours — you'll get a notification.`
              : `${dollars(result.netCents != null ? result.netCents : result.amountCents)} is on its way to your ${destObj ? destObj.kind : 'account'} (${speedLabel(result.speed || speed).toLowerCase()}).`}</Text>
          <PressBtn onPress={() => { setPhase('form'); setAmount(''); setResult(null); if (onDone) onDone(); }} style={{ marginTop: 26 * s, backgroundColor: COLORS.lime, borderRadius: 20 * s, paddingVertical: 30 * s, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: '#10140C', letterSpacing: 0.06 * 36 * s }}>DONE</Text></PressBtn>
        </View>
      ) : null}

      {/* history */}
      {st && st.recent && st.recent.length ? (
        <View style={{ marginTop: 30 * s }}>
          <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>RECENT WITHDRAWALS</Text>
          {st.recent.map((w) => (
            <View key={w.withdrawalId} style={{ marginHorizontal: 45 * s, marginBottom: 14 * s, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.18)', borderRadius: 20 * s, paddingVertical: 24 * s, paddingHorizontal: 30 * s }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream }}>{dollars(w.amountCents)} <Text style={{ color: COLORS.creamDim, fontFamily: FONTS.interSemi, fontSize: 24 * s }}>→ {w.destination && w.destination.kind === 'card' ? 'card' : 'bank'} ••{(w.destination && w.destination.last4) || '????'}</Text></Text>
                <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, color: w.status === 'paid' ? COLORS.lime : (w.status === 'failed' || w.status === 'rejected') ? RED : COLORS.creamDim, letterSpacing: 0.06 * 22 * s, marginTop: 6 * s }}>{statusLabel(w)} · {new Date(w.createdAt).toLocaleDateString()}</Text>
              </View>
              {w.status === 'requested' ? (<Pressable onPress={() => cancel(w.withdrawalId)} hitSlop={12}><Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: RED, letterSpacing: 0.06 * 24 * s }}>CANCEL</Text></Pressable>) : null}
            </View>))}
        </View>
      ) : null}

      {/* Coinflow hosted KYC + linking */}
      <Modal visible={!!linkUrl} animationType="slide" onRequestClose={() => linkDone()}>
        <View style={{ flex: 1, backgroundColor: '#10140D', paddingTop: Platform.OS === 'ios' ? 54 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 16, color: COLORS.cream, letterSpacing: 1 }}>SECURED BY COINFLOW</Text>
            <Pressable onPress={() => linkDone()} hitSlop={16}><Text style={{ fontFamily: FONTS.interExtra, fontSize: 16, color: COLORS.lime, letterSpacing: 1 }}>CLOSE</Text></Pressable>
          </View>
          {linkUrl ? (
            <WebView source={{ uri: linkUrl }} style={{ flex: 1, backgroundColor: '#fff' }} originWhitelist={['https://*']} javaScriptEnabled domStorageEnabled sharedCookiesEnabled
              onMessage={(e) => { try { const m = JSON.parse(e.nativeEvent.data); if (m && m.method === 'accountLinked') linkDone('Linked — you can withdraw now'); } catch {} }}
              onShouldStartLoadWithRequest={(req) => { if (String(req.url || '').startsWith(LINK_RETURN)) { linkDone('Linked — you can withdraw now'); return false; } return true; }}
              onError={() => { linkDone(); setErr('Could not open verification — try again'); }} />
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}
