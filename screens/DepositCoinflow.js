// ── DEPOSIT via COINFLOW HOSTED CHECKOUT (B131, 2026-09-10; supersedes the 2026-09-08 card form) ──
// Apple Pay · PayPal · Venmo · Cash App · crypto — Coinflow's own checkout, Triumph-style. No raw
// card entry, no ACH (settles in ~3 days). Flow, and the one rule that matters:
//   keypad amount + method dropdown → POST /api/deposit/intent { amountCents, idempotencyKey, method }
//     (server runs EVERY gate: $10 floor, per-deposit ceiling, geo, freeze, tier caps; creates the
//      deposits row; mints the Coinflow session key)
//   → CoinflowPurchase (WebView) with the amount LOCKED and webhookInfo = { depositId … }
//   → user pays inside Coinflow's UI → we POLL /api/deposit/status until Coinflow's signed
//     `Settled` webhook credits it. THE PHONE NEVER DECIDES THAT MONEY ARRIVED: success is shown
//     only when the server reports status `settled`. If polling times out, the balance still
//     updates by itself when the webhook lands.
// Limits (min, per-deposit ceiling, remaining today) come from /api/deposit/limits — the app has
// no numbers of its own beyond STRICT fallbacks for the instant before that fetch lands.
// Errors from the server are CODES; the copy lives here.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';
import CoinflowPurchase from './CoinflowPurchase';
import AmountKeypad, { toCents } from './components/AmountKeypad';

// B132: the method is picked HERE (Triumph-style dropdown) and CoinflowPurchase is told to show only that one.
// Coinflow's enum names; the label is what the player sees. No raw card, no ACH — deliberate (DECISIONS 2026-09-10).
const METHODS = [
  { id: 'applePay', label: 'Apple Pay', glyph: '\uF8FF', cta: 'PAY WITH APPLE PAY' },
  { id: 'paypal',   label: 'PayPal',    glyph: 'P',      cta: 'PAY WITH PAYPAL' },
  { id: 'venmo',    label: 'Venmo',     glyph: 'V',      cta: 'PAY WITH VENMO' },
  { id: 'cashApp',  label: 'Cash App',  glyph: '$',      cta: 'PAY WITH CASH APP' },
  { id: 'crypto',   label: 'Crypto',    glyph: '\u20BF', cta: 'PAY WITH CRYPTO' },
];

// Fallbacks only — must never be MORE permissive than the server, or a chip could be offered that
// the server then rejects.
const DEFAULT_MIN = 1000;   // $10 — server MIN_DEPOSIT_CENTS
const DEFAULT_MAX = 50000;  // $500 — unverified per-deposit ceiling
const ALL_CHIPS = [1000, 2000, 5000, 10000]; // Triumph's row; shown only where min <= chip <= max
const POLL_MS = 2000, POLL_MAX_MS = 90000;               // PayPal/Venmo round-trips are slower than a card

const dollars = (cents) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

// Coinflow's theme object (same keys the card form used) so the hosted checkout matches the app.
const CHECKOUT_THEME = {
  background: '#10140D', cardBackground: '#10140D', backgroundAccent: '#1A2418', backgroundAccent2: '#1A2418',
  textColor: '#F5F1E6', textColorAccent: 'rgba(245,241,230,0.7)', textColorAction: '#D4F23C', placeholderColor: 'rgba(245,241,230,0.4)',
  primary: '#D4F23C', ctaColor: '#D4F23C', style: 'rounded', fontSize: '18px', fontWeight: '600',
};

let _installId = null;
async function installId() { // stable per install; Coinflow's deviceId (chargeback protection)
  if (_installId) return _installId;
  try {
    const v = await AsyncStorage.getItem('sense_install_id');
    if (v) { _installId = v; return v; }
    const n = 'inst_' + Crypto.randomUUID();
    await AsyncStorage.setItem('sense_install_id', n); _installId = n; return n;
  } catch { return 'inst_unknown'; }
}

function humanError(code, j) {
  switch (code) {
    case 'cooldown': case 'rate_limited': return 'Too many attempts — try again in an hour';
    case 'in_flight': return 'A deposit is already processing — give it a minute';
    case 'cap_daily': return 'Daily deposit limit reached (' + dollars((j && j.capCents) || 50000) + ' per day)';
    case 'cap_monthly': return '30-day deposit limit reached (' + dollars((j && j.capCents) || 200000) + ')';
    case 'cap_lifetime': return 'Deposit limit reached — identity verification is needed to raise it';
    case 'balance_cap': return 'Balance limit reached (' + dollars((j && j.capCents) || 1000000) + ')';
    case 'checkout_unavailable': case 'deposit_unavailable': case 'provider_unsupported': return 'Payments are temporarily unavailable — try again shortly';
    case 'min_deposit': return 'Minimum deposit is ' + dollars((j && j.minCents) || DEFAULT_MIN);
    case 'max_deposit': return 'Maximum deposit is ' + dollars((j && j.maxCents) || DEFAULT_MAX);
    case 'email_required': case 'auth': return 'Sign in with email to deposit';
    case 'idempotency_key_required': case 'idempotency_mismatch': return 'Start a new deposit and try again';
    default: return code || 'Deposit failed — try again';
  }
}

function CheckIcon({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke="#10140C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>);
}

export default function DepositCoinflow({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', payments, onToast, onRefresh, onDone, onNeedDob, onNeedGps }) {
  const s = useScale();
  const env = (payments && payments.coinflow && payments.coinflow.env) || 'sandbox';      // never default to prod
  const merchantId = (payments && payments.coinflow && payments.coinflow.merchantId) || 'sensegame';
  const [amount, setAmount] = useState('10');            // keypad string (B132)
  const [method, setMethod] = useState(METHODS[0]);       // chosen pay-in method
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lim, setLim] = useState(null);         // { minCents, cardMaxCents, maxCents, remainingTodayCents, tier, verifiedTier } from /api/deposit/limits
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('amount'); // amount | checkout | processing
  const [intent, setIntent] = useState(null);   // { depositId, amountCents, sessionKey, webhookInfo, checkout:{…} } from /api/deposit/intent
  const [err, setErr] = useState('');
  const inFlightRef = useRef(false);   // synchronous double-tap guard
  const idemRef = useRef(null);        // one idempotency key per amount confirmation: a retry replays the same intent
  const pollingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { installId(); return () => { alive.current = false; }; }, []);
  useEffect(() => { // limits are the server's — tier, min, per-deposit ceiling. Never assume.
    if (!supabaseToken) return;
    fetch(`${httpsBase}/api/deposit/limits`, { headers: { Authorization: 'Bearer ' + supabaseToken } }).then((r) => r.json()).then((j) => { if (alive.current && j && j.ok) setLim(j); }).catch(() => {});
  }, [supabaseToken]);
  const MIN_CENTS = (lim && Number.isInteger(lim.minCents) && lim.minCents > 0) ? lim.minCents : DEFAULT_MIN;
  // The method is picked inside Coinflow's UI, so the ceiling that applies is the STRICTER one the server reports.
  const MAX_CENTS = (lim && (Number.isInteger(lim.cardMaxCents) ? lim.cardMaxCents : lim.maxCents)) || DEFAULT_MAX;
  const CHIP_CENTS = ALL_CHIPS.filter((c) => c >= MIN_CENTS && c <= MAX_CENTS);

  const canDeposit = !!supabaseToken;
  const effCents = toCents(amount);
  const amountOk = effCents >= MIN_CENTS && effCents <= MAX_CENTS;
  const formOk = canDeposit && amountOk && !busy;

  const finish = useCallback((toastText, kind) => {
    idemRef.current = null;
    if (toastText && onToast) onToast(toastText, kind);
    if (onRefresh) onRefresh();
    if (onDone) onDone();
  }, [onToast, onRefresh, onDone]);

  async function pollUntilSettled(depositId, expectCents) {
    if (pollingRef.current) return 'already';
    pollingRef.current = true;
    try {
      const t0 = Date.now();
      while (alive.current && Date.now() - t0 < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let j = null;
        try { const r = await fetch(`${httpsBase}/api/deposit/status?id=${encodeURIComponent(depositId)}`, { headers: { Authorization: 'Bearer ' + supabaseToken } }); j = await r.json().catch(() => null); } catch { j = null; }
        if (!j || !j.status) continue;
        if (j.status === 'settled') { finish(`DEPOSITED ${dollars(j.settledCents || expectCents)} · NEW BALANCE ${Number.isInteger(j.balanceCents) ? dollars(j.balanceCents) : balance}`); return 'settled'; }
        if (j.status === 'failed') { setErr('Payment declined — try another method'); setPhase('amount'); setIntent(null); return 'failed'; }
        if (j.status === 'review') { finish('Deposit under review — it will be credited once confirmed', 'error'); return 'review'; }
        if (j.status === 'amount_mismatch') { finish('Deposit on hold — support will sort it out', 'error'); return 'held'; }
        // created / expired / unknown / pending / authorized: keep waiting
      }
      if (alive.current) finish('Still processing — your balance updates automatically once the payment confirms', 'error');
      return 'timeout';
    } finally { pollingRef.current = false; }
  }

  async function startCheckout() {
    if (!formOk) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErr(''); setBusy(true);
    try {
      if (!idemRef.current) idemRef.current = Crypto.randomUUID();
      const body = { supabaseToken, amountCents: effCents, idempotencyKey: idemRef.current, deviceId: await installId(), method: method.id };
      let res, j;
      try { res = await fetch(`${httpsBase}/api/deposit/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await res.json().catch(() => ({})); }
      catch { throw new Error('Network error reaching the server — try again'); }
      if (res.ok && j && j.ok) {
        if (j.deduped && j.status && j.status !== 'created' && j.status !== 'expired') { setPhase('processing'); await pollUntilSettled(j.depositId, effCents); return; } // already paid this one
        setIntent(j); setPhase('checkout');
        return;
      }
      if (j && j.needGps) { if (onNeedGps) { onNeedGps(() => startCheckout()); return; } }   // location is required for a deposit, same as a game
      if (j && j.needDob) { if (onNeedDob) { onNeedDob(() => startCheckout()); return; } }
      const code = j && j.error;
      idemRef.current = null;
      const msg = res.status === 451 || res.status === 403 || res.status === 503 ? (code || 'Deposits are unavailable right now') : humanError(code, j);
      setErr(msg); if (onToast) onToast(msg, 'error');
    } catch (e) {
      setErr(e.message || 'Deposit failed — try again'); if (onToast) onToast(e.message || 'Deposit failed — try again', 'error');
    } finally {
      if (alive.current) setBusy(false);
      inFlightRef.current = false;
    }
  }

  const onPaid = useCallback(() => { // the hosted page says the payment went through — now ask OUR server
    if (!intent) return;
    setPhase('processing');
    pollUntilSettled(intent.depositId, intent.amountCents);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  const onExternal = useCallback(() => { // PayPal / Venmo left the app; the outcome may land while we are in the background
    if (!intent) return;
    pollUntilSettled(intent.depositId, intent.amountCents);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDeclined = useCallback((info) => {
    const why = info && (info.message || info.error);
    setErr(why ? String(why).slice(0, 120) : 'Payment declined — try another method');
  }, []);
  const backToAmount = () => { setPhase('amount'); setIntent(null); setErr(''); };

  const labelStyle = { fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.1 * 24 * s, marginBottom: 14 * s, marginLeft: 6 * s };

  // ── checkout / processing: Coinflow's UI owns the screen ─────────────────────────────────────
  if (phase !== 'amount' && intent) {
    const c = intent.checkout || {};
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 45 * s, marginBottom: 16 * s }}>
          <Pressable onPress={backToAmount} hitSlop={16} disabled={phase === 'processing'}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: phase === 'processing' ? COLORS.creamDim : COLORS.lime, letterSpacing: 0.06 * 28 * s }}>‹ AMOUNT</Text>
          </Pressable>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: COLORS.cream, includeFontPadding: false }}>{dollars(intent.amountCents)}</Text>
          <View style={{ width: 120 * s }} />
        </View>
        {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: '#FF5A48', textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 16 * s }}>{err}</Text>) : null}
        {phase === 'processing' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 * s }}>
            <ActivityIndicator color={COLORS.lime} size="large" />
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream, letterSpacing: 0.06 * 30 * s }}>CONFIRMING PAYMENT…</Text>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', marginHorizontal: 60 * s }}>Your balance updates the moment Coinflow confirms — you can leave this screen.</Text>
          </View>
        ) : (
          <View style={{ flex: 1, marginHorizontal: 24 * s, borderRadius: 24 * s, overflow: 'hidden', backgroundColor: '#10140D', borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.35)' }}>
            <CoinflowPurchase env={c.env || env} merchantId={c.merchantId || merchantId} sessionKey={intent.sessionKey} cents={intent.amountCents}
              webhookInfo={intent.webhookInfo} email={c.email || signedInEmail || undefined}
              allowedPaymentMethods={(c.allowedPaymentMethods || []).includes(method.id) ? [method.id] : c.allowedPaymentMethods}
              chargebackProtectionData={c.chargebackProtectionData} chargebackProtectionAccountType={c.chargebackProtectionAccountType}
              deviceId={_installId || undefined} theme={CHECKOUT_THEME}
              onSuccess={onPaid} onExternalRedirect={onExternal} onAuthDeclined={onDeclined}
              onError={() => setErr('Checkout could not load — check your connection and go back')} />
          </View>
        )}
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.06 * 22 * s, marginTop: 20 * s, marginBottom: 30 * s, marginHorizontal: 45 * s }}>
          {method.label.toUpperCase()} · SECURED BY COINFLOW</Text>
      </View>
    );
  }

  // ── amount ───────────────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark, textAlign: 'center', includeFontPadding: false, marginBottom: 16 * s }}>ADD FUNDS</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 16 * s, marginBottom: 40 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, color: COLORS.cream, letterSpacing: 0.08 * 32 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.lime }}>{balance}</Text>
      </View>

      <AmountKeypad value={amount} onChange={(v) => { setAmount(v); idemRef.current = null; }} maxCents={MAX_CENTS} allowCents={false}
        hint={`MIN ${dollars(MIN_CENTS)} · MAX ${dollars(MAX_CENTS)}${lim && Number.isInteger(lim.remainingTodayCents) ? ' · ' + dollars(lim.remainingTodayCents) + ' LEFT TODAY' : ''}`}
        chips={CHIP_CENTS.map((c) => ({ label: dollars(c), cents: c }))} />

      {/* method dropdown — Triumph's pill + sheet */}
      <View style={{ alignItems: 'center', marginTop: 26 * s, marginBottom: 30 * s }}>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 * s, paddingVertical: 20 * s, paddingHorizontal: 40 * s, borderRadius: 50 * s, backgroundColor: 'rgba(245,241,230,0.08)', borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.14)' }}>
          <Text style={{ fontFamily: FONTS.interBlack, fontSize: 30 * s, color: COLORS.cream, includeFontPadding: false }}>{method.glyph}</Text>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream }}>{method.label}</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, color: COLORS.creamDim }}>▼</Text>
        </Pressable>
      </View>
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPickerOpen(false)}>
          <View style={{ width: '70%', backgroundColor: '#1A2418', borderRadius: 28 * s, overflow: 'hidden', borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.14)' }}>
            {METHODS.map((m, i) => (
              <Pressable key={m.id} onPress={() => { setMethod(m); setPickerOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 28 * s, paddingHorizontal: 34 * s, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(245,241,230,0.12)', backgroundColor: m.id === method.id ? 'rgba(212,242,60,0.12)' : 'transparent' }}>
                <Text style={{ fontFamily: FONTS.interSemi, fontSize: 32 * s, color: COLORS.cream }}>{m.label}</Text>
                <Text style={{ fontFamily: FONTS.interBlack, fontSize: 30 * s, color: m.id === method.id ? COLORS.lime : COLORS.cream, includeFontPadding: false }}>{m.glyph}</Text>
              </Pressable>))}
          </View>
        </Pressable>
      </Modal>


      {env !== 'prod' ? (
        <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, backgroundColor: 'rgba(212,242,60,0.10)', borderWidth: 1.5 * s, borderColor: 'rgba(215,248,74,0.35)', borderRadius: 16 * s, paddingVertical: 20 * s, paddingHorizontal: 26 * s }}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.lime, letterSpacing: 0.06 * 24 * s, marginBottom: 6 * s }}>SANDBOX</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.02 * 24 * s }}>Apple Pay needs a real device (simulator renders the button but can't tap it). PayPal/Venmo/Cash App show only if Coinflow has enabled them for this merchant.</Text>
        </View>
      ) : null}

      {!canDeposit ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.flameOut, textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 26 * s, letterSpacing: 0.04 * 26 * s }}>SIGN IN WITH EMAIL TO DEPOSIT REAL FUNDS</Text>
      ) : null}
      {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: '#FF5A48', textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 22 * s }}>{err}</Text>) : null}

      <PressBtn onPress={startCheckout} disabled={!formOk}
        style={{ opacity: formOk ? 1 : 0.5, marginHorizontal: 45 * s, backgroundColor: COLORS.lime, borderRadius: RADII.cta * s, paddingVertical: 44 * s, alignItems: 'center',
          flexDirection: 'row', justifyContent: 'center', gap: 18 * s, shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s, shadowOpacity: 0.55, elevation: 10 }}>
        {busy ? <ActivityIndicator color="#10140C" /> : <CheckIcon size={48 * s} />}
        <Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C', letterSpacing: 0.03 * 60 * s, includeFontPadding: false }}>{busy ? 'ONE SEC…' : method.cta + ' · ' + dollars(effCents)}</Text>
      </PressBtn>

      <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.06 * 22 * s, marginTop: 26 * s, marginHorizontal: 45 * s }}>
        {signedInEmail ? signedInEmail + ' · ' : ''}MAX {dollars(MAX_CENTS)} PER DEPOSIT{lim && Number.isInteger(lim.remainingTodayCents) ? ' · ' + dollars(lim.remainingTodayCents) + ' LEFT TODAY' : ''} · APPLE PAY · PAYPAL · VENMO · CASH APP</Text>
      {lim && lim.tier !== 'verified' && lim.verifiedTier ? (
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.04 * 22 * s, marginTop: 10 * s, marginHorizontal: 45 * s }}>
          VERIFY YOUR IDENTITY (PROFILE → WITHDRAW → VERIFY) TO RAISE LIMITS TO {dollars(lim.verifiedTier.cardMaxCents || lim.verifiedTier.maxCents)} PER DEPOSIT · {dollars(lim.verifiedTier.dayCents)} PER DAY</Text>
      ) : null}
    </ScrollView>
  );
}
