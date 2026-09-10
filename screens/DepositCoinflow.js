// ── DEPOSIT via COINFLOW HOSTED CHECKOUT (B131; B133 = the Triumph-parity sheet) ────────────────
// A full-screen iOS sheet OVER the app — not a tab route — so nothing competes with it for height
// and the pay button is always the bottom-most thing on screen. Order matches Triumph exactly:
//   close · balance pill · amount · METHOD PILL · quick chips · keypad · pay button · terms
//
// Flow, and the one rule that matters:
//   amount settles → POST /api/deposit/intent { amountCents, idempotencyKey, method }
//     (server runs EVERY gate: $10 floor, per-deposit ceiling, geo, freeze, tier caps; creates the
//      deposits row; mints the Coinflow session key)
//   → Apple Pay / PayPal / Venmo: the CTA is COINFLOW'S OWN hosted button for that brand, so the
//     mark is drawn by the brand's SDK (which is what their brand rules require) and it is one tap.
//     Cash App / crypto have no standalone button: the CTA opens the checkout with only that method.
//   → we POLL /api/deposit/status until Coinflow's signed `Settled` webhook credits it. THE PHONE
//     NEVER DECIDES THAT MONEY ARRIVED: success is shown only when the server reports `settled`.
//     If polling times out, the balance still updates by itself when the webhook lands.
//
// The intent is created EAGERLY (debounced) so the Apple Pay button is live before the first tap.
// That is safe by design: a new intent supersedes the account's older unpaid ones server-side
// (db.depositExpireIntents), expired rows drop out of the cap maths, and unpaid intents do not
// count toward attempts-per-hour. Remounting the button on depositId gives the page a fresh
// subtotal, which is why we don't need their hidden bridge WebView.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { COLORS, FONTS, useScale } from './theme';
import PressBtn from './components/PressBtn';
import CoinflowPurchase, { CoinflowMethodButton, STANDALONE_METHODS } from './CoinflowPurchase';
import AmountKeypad, { toCents } from './components/AmountKeypad';
import PayLogo, { BRAND } from './components/PayLogo';

const TERMS_URL = 'https://dogmomhq.github.io/sense-legal/terms.html';
// Coinflow's enum ids; label is what the player sees. No raw card, no ACH — deliberate (DECISIONS 2026-09-10).
const METHODS = [
  { id: 'applePay', label: 'Apple Pay', cta: 'PAY WITH APPLE PAY' },
  { id: 'paypal',   label: 'PayPal',    cta: 'PAY WITH PAYPAL' },
  { id: 'venmo',    label: 'Venmo',     cta: 'PAY WITH VENMO' },
  { id: 'cashApp',  label: 'Cash App',  cta: 'PAY WITH CASH APP' },
  { id: 'crypto',   label: 'Crypto',    cta: 'PAY WITH CRYPTO' },
];
// Fallbacks only — never MORE permissive than the server, or a chip could be offered that it rejects.
const DEFAULT_MIN = 1000;   // $10 — server MIN_DEPOSIT_CENTS
const DEFAULT_MAX = 50000;  // $500 — unverified per-deposit ceiling
const ALL_CHIPS = [1000, 2000, 5000, 10000];
const POLL_MS = 2000, POLL_MAX_MS = 90000;
const INTENT_DEBOUNCE_MS = 700;

const dollars = (cents) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

// Coinflow's theme object so the hosted checkout matches the app.
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
    case 'cap_lifetime': return 'Deposit limit reached — verify your identity to raise it';
    case 'balance_cap': return 'Balance limit reached (' + dollars((j && j.capCents) || 1000000) + ')';
    case 'checkout_unavailable': case 'deposit_unavailable': case 'provider_unsupported': return 'Payments are temporarily unavailable — try again shortly';
    case 'min_deposit': return 'Minimum deposit is ' + dollars((j && j.minCents) || DEFAULT_MIN);
    case 'max_deposit': return 'Maximum deposit is ' + dollars((j && j.maxCents) || DEFAULT_MAX);
    case 'email_required': case 'auth': return 'Sign in with email to deposit';
    case 'idempotency_key_required': case 'idempotency_mismatch': return 'Start a new deposit and try again';
    default: return code || 'Deposit failed — try again';
  }
}

export default function DepositCoinflow({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', payments, onToast, onRefresh, onDone, onNeedDob, onNeedGps }) {
  const s = useScale();
  const env = (payments && payments.coinflow && payments.coinflow.env) || 'sandbox';      // never default to prod
  const merchantId = (payments && payments.coinflow && payments.coinflow.merchantId) || 'sensegame';
  const [amount, setAmount] = useState('10');
  const [method, setMethod] = useState(METHODS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lim, setLim] = useState(null);         // /api/deposit/limits
  const [intent, setIntent] = useState(null);   // { depositId, amountCents, sessionKey, webhookInfo, checkout:{…} }
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('amount'); // amount | checkout | processing
  const [err, setErr] = useState('');
  const [overlay, setOverlay] = useState(false); // PayPal/Venmo approval modal is open — it needs the whole sheet
  const inFlightRef = useRef(false);
  const idemRef = useRef(null);
  const pollingRef = useRef(false);
  const intentTimer = useRef(null);
  const alive = useRef(true);
  useEffect(() => { installId(); return () => { alive.current = false; if (intentTimer.current) clearTimeout(intentTimer.current); }; }, []);
  useEffect(() => {
    if (!supabaseToken) return;
    fetch(`${httpsBase}/api/deposit/limits`, { headers: { Authorization: 'Bearer ' + supabaseToken } }).then((r) => r.json()).then((j) => { if (alive.current && j && j.ok) setLim(j); }).catch(() => {});
  }, [supabaseToken]);

  const MIN_CENTS = (lim && Number.isInteger(lim.minCents) && lim.minCents > 0) ? lim.minCents : DEFAULT_MIN;
  // This sheet's methods are all card-rail-priced, so the ceiling that applies is the stricter one.
  const MAX_CENTS = (lim && (Number.isInteger(lim.cardMaxCents) ? lim.cardMaxCents : lim.maxCents)) || DEFAULT_MAX;
  const CHIP_CENTS = ALL_CHIPS.filter((c) => c >= MIN_CENTS && c <= MAX_CENTS);
  const cents = toCents(amount);
  const amountOk = cents >= MIN_CENTS && cents <= MAX_CENTS;
  const canDeposit = !!supabaseToken;

  const close = useCallback(() => { if (onDone) onDone(); }, [onDone]);
  const finish = useCallback((toastText, kind) => {
    idemRef.current = null;
    if (toastText && onToast) onToast(toastText, kind);
    if (onRefresh) onRefresh();
    close();
  }, [onToast, onRefresh, close]);

  async function pollUntilSettled(depositId, expectCents) {
    if (pollingRef.current) return 'already';
    pollingRef.current = true; setPhase('processing');
    try {
      const t0 = Date.now();
      while (alive.current && Date.now() - t0 < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let j = null;
        try { const r = await fetch(`${httpsBase}/api/deposit/status?id=${encodeURIComponent(depositId)}`, { headers: { Authorization: 'Bearer ' + supabaseToken } }); j = await r.json().catch(() => null); } catch { j = null; }
        if (!j || !j.status) continue;
        if (j.status === 'settled') { finish(`DEPOSITED ${dollars(j.settledCents || expectCents)}`); return 'settled'; }
        if (j.status === 'failed') { setErr('Payment declined — try another method'); setPhase('amount'); setIntent(null); idemRef.current = null; return 'failed'; }
        if (j.status === 'review') { finish('Deposit under review — it will be credited once confirmed', 'error'); return 'review'; }
        if (j.status === 'amount_mismatch') { finish('Deposit on hold — support will sort it out', 'error'); return 'held'; }
        // created / expired / unknown / pending / authorized: keep waiting
      }
      if (alive.current) finish('Still processing — your balance updates automatically once the payment confirms', 'error');
      return 'timeout';
    } finally { pollingRef.current = false; }
  }

  // `loud` = the user tapped, so location / DOB prompts are allowed. The debounced background call
  // is quiet: it must never pop a system dialog while someone is still typing an amount.
  const ensureIntent = useCallback(async (loud) => {
    if (!canDeposit || !amountOk || inFlightRef.current) return null;
    if (intent && intent.amountCents === cents && intent.method === method.id) return intent;
    inFlightRef.current = true; if (loud) setBusy(true);
    try {
      if (!idemRef.current) idemRef.current = Crypto.randomUUID();
      const body = { supabaseToken, amountCents: cents, idempotencyKey: idemRef.current, deviceId: await installId(), method: method.id };
      const res = await fetch(`${httpsBase}/api/deposit/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!alive.current) return null;
      if (res.ok && j && j.ok) {
        if (j.deduped && j.status && j.status !== 'created' && j.status !== 'expired') { pollUntilSettled(j.depositId, cents); return null; }
        const next = { ...j, method: method.id }; setIntent(next); setErr(''); return next;
      }
      idemRef.current = null;
      if (loud && j && j.needGps && onNeedGps) { onNeedGps(() => ensureIntent(true)); return null; }
      if (loud && j && j.needDob && onNeedDob) { onNeedDob(() => ensureIntent(true)); return null; }
      const code = j && j.error;
      setErr(res.status === 451 || res.status === 403 || res.status === 503 ? (code || 'Deposits are unavailable right now') : humanError(code, j));
      return null;
    } catch { if (alive.current && loud) setErr('Network error reaching the server — try again'); return null; }
    finally { if (alive.current) setBusy(false); inFlightRef.current = false; }
  }, [canDeposit, amountOk, cents, method, intent, supabaseToken, httpsBase, onNeedGps, onNeedDob]);

  // Debounced eager intent so the real Apple Pay button is mounted before the first tap.
  useEffect(() => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    if (phase !== 'amount' || !amountOk || !canDeposit) return;
    if (intent && (intent.amountCents !== cents || intent.method !== method.id)) setIntent(null);
    intentTimer.current = setTimeout(() => { ensureIntent(false); }, INTENT_DEBOUNCE_MS);
    return () => { if (intentTimer.current) clearTimeout(intentTimer.current); };
  }, [cents, method, amountOk, canDeposit, phase]);

  const onPaid = useCallback(() => { if (intent) pollUntilSettled(intent.depositId, intent.amountCents); }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openSheet() { // non-Apple-Pay methods: Coinflow's checkout with only that method
    const it = intent && intent.amountCents === cents && intent.method === method.id ? intent : await ensureIntent(true);
    if (it) setPhase('checkout');
  }

  const brand = BRAND[method.id] || BRAND.crypto;
  const ctaBase = { marginHorizontal: 45 * s, borderRadius: 44 * s, height: 140 * s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 16 * s };
  const shell = (children) => (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#0B0E09', paddingTop: Platform.OS === 'ios' ? 18 * s : 30 * s }}>{children}</View>
    </Modal>);
  const closeBtn = (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 40 * s }}>
      <Pressable onPress={close} hitSlop={18} style={{ width: 84 * s, height: 84 * s, borderRadius: 42 * s, backgroundColor: 'rgba(245,241,230,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 40 * s, color: COLORS.cream, includeFontPadding: false, lineHeight: 44 * s }}>×</Text>
      </Pressable>
    </View>);
  const balancePill = (
    <View style={{ alignItems: 'center', marginTop: 6 * s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * s, paddingVertical: 16 * s, paddingHorizontal: 32 * s, borderRadius: 40 * s, backgroundColor: 'rgba(245,241,230,0.08)' }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim }}>Balance: </Text>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 26 * s, color: COLORS.cream }}>{balance}</Text>
      </View>
    </View>);

  // ── checkout / processing ────────────────────────────────────────────────────────────────────
  if (phase !== 'amount' && intent) {
    const c = intent.checkout || {};
    return shell(<>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40 * s }}>
        <Pressable onPress={() => { setPhase('amount'); setErr(''); }} hitSlop={16} disabled={phase === 'processing'}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: phase === 'processing' ? COLORS.creamDim : COLORS.lime, letterSpacing: 0.06 * 28 * s }}>‹ BACK</Text>
        </Pressable>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 56 * s, color: COLORS.cream, includeFontPadding: false }}>{dollars(intent.amountCents)}</Text>
        <Pressable onPress={close} hitSlop={18}><Text style={{ fontFamily: FONTS.interBold, fontSize: 36 * s, color: COLORS.cream }}>×</Text></Pressable>
      </View>
      {err ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: '#FF5A48', textAlign: 'center', marginHorizontal: 45 * s, marginTop: 14 * s }}>{err}</Text> : null}
      {phase === 'processing' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 * s }}>
          <ActivityIndicator color={COLORS.lime} size="large" />
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream, letterSpacing: 0.06 * 30 * s }}>CONFIRMING PAYMENT…</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', marginHorizontal: 60 * s }}>Your balance updates the moment Coinflow confirms — you can leave this screen.</Text>
        </View>
      ) : (
        <View style={{ flex: 1, marginHorizontal: 24 * s, marginTop: 20 * s, marginBottom: 30 * s, borderRadius: 24 * s, overflow: 'hidden', backgroundColor: '#10140D' }}>
          <CoinflowPurchase env={c.env || env} merchantId={c.merchantId || merchantId} sessionKey={intent.sessionKey} cents={intent.amountCents}
            webhookInfo={intent.webhookInfo} email={c.email || signedInEmail || undefined}
            allowedPaymentMethods={[method.id]} chargebackProtectionData={c.chargebackProtectionData}
            chargebackProtectionAccountType={c.chargebackProtectionAccountType} deviceId={_installId || undefined} theme={CHECKOUT_THEME}
            onSuccess={onPaid} onExternalRedirect={onPaid}
            onAuthDeclined={(info) => setErr((info && (info.message || info.error)) ? String(info.message || info.error).slice(0, 120) : 'Payment declined — try another method')}
            onError={() => setErr('Checkout could not load — check your connection and go back')} />
        </View>
      )}
    </>);
  }

  // ── amount (Triumph order: close · balance · amount · METHOD · chips · keypad · pay · terms) ──
  const intentReady = !!(intent && intent.amountCents === cents && intent.method === method.id);
  const showBrandButton = STANDALONE_METHODS.includes(method.id) && intentReady && amountOk;
  return shell(<>
    {overlay ? null : closeBtn}
    {overlay ? null : balancePill}
    {overlay ? null : (<View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 200 * s, color: COLORS.cream, textAlign: 'center', includeFontPadding: false }} numberOfLines={1} adjustsFontSizeToFit>
        {amount ? '$' + amount : '$0'}</Text>
      {/* method pill sits directly under the amount — Triumph's position */}
      <View style={{ alignItems: 'center', marginTop: 40 * s }}>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 * s, paddingVertical: 20 * s, paddingHorizontal: 38 * s, borderRadius: 50 * s, backgroundColor: 'rgba(245,241,230,0.10)' }}>
          <PayLogo id={method.id} size={30 * s} />
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream }}>{method.label}</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 20 * s, color: COLORS.creamDim }}>▼</Text>
        </Pressable>
      </View>
      {!amountOk && amount ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: '#FF5A48', textAlign: 'center', marginTop: 22 * s }}>
          {cents < MIN_CENTS ? 'Minimum ' + dollars(MIN_CENTS) : 'Maximum ' + dollars(MAX_CENTS)}</Text>
      ) : err ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: '#FF5A48', textAlign: 'center', marginTop: 22 * s, marginHorizontal: 45 * s }}>{err}</Text>
      ) : null}
    </View>)}

    {overlay || !CHIP_CENTS.length ? null : (
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 * s, marginHorizontal: 40 * s, marginBottom: 8 * s }}>
        {CHIP_CENTS.map((c) => { const on = cents === c; return (
          <Pressable key={c} onPress={() => setAmount(String(c / 100))} style={{ flex: 1, alignItems: 'center', paddingVertical: 26 * s, borderRadius: 40 * s,
            backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(245,241,230,0.08)', borderWidth: on ? 2 * s : 0, borderColor: COLORS.lime }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: on ? COLORS.lime : COLORS.cream }}>{dollars(c)}</Text>
          </Pressable>); })}
      </View>)}

    {overlay ? null : <AmountKeypad value={amount} onChange={setAmount} maxCents={MAX_CENTS} allowCents={false} hideDisplay compact />}

    <View style={overlay ? { flex: 1 } : { marginBottom: 10 * s }}>
      {showBrandButton ? (
        // Coinflow's OWN hosted button for this brand — one tap, the brand's real mark and sheet.
        // Keyed on the intent so a new amount remounts it with a fresh subtotal (see header note).
        <CoinflowMethodButton key={intent.depositId + method.id} method={method.id} color="white" height={140 * s} radius={44 * s}
          expanded={overlay} onOverlay={setOverlay} style={overlay ? undefined : { marginHorizontal: 45 * s }}
          env={(intent.checkout && intent.checkout.env) || env} merchantId={(intent.checkout && intent.checkout.merchantId) || merchantId}
          sessionKey={intent.sessionKey} cents={intent.amountCents} webhookInfo={intent.webhookInfo}
          email={signedInEmail || undefined} deviceId={_installId || undefined} theme={CHECKOUT_THEME}
          chargebackProtectionData={intent.checkout && intent.checkout.chargebackProtectionData}
          chargebackProtectionAccountType={intent.checkout && intent.checkout.chargebackProtectionAccountType}
          onApprove={onPaid} onError={() => setErr(method.label + ' could not start — try another method')} />
      ) : (
        <PressBtn onPress={openSheet} disabled={!canDeposit || !amountOk || busy}
          style={[ctaBase, { backgroundColor: brand.bg, opacity: (!canDeposit || !amountOk || busy) ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator color={brand.fg} /> : <PayLogo id={method.id} size={30 * s} on={brand.bg === '#FFFFFF' || brand.bg === COLORS.lime ? 'light' : 'dark'} />}
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 34 * s, color: brand.fg, letterSpacing: 0.04 * 34 * s }}>{method.cta}</Text>
        </PressBtn>
      )}
      {overlay ? null : (<Text style={{ fontFamily: FONTS.interSemi, fontSize: 20 * s, color: 'rgba(245,241,230,0.45)', textAlign: 'center', marginTop: 18 * s, marginHorizontal: 45 * s }}>
        {!canDeposit ? 'Sign in with email to deposit real funds' : <>By submitting your transaction you agree to the Sense{' '}
          <Text onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} style={{ textDecorationLine: 'underline' }}>Terms of Use</Text></>}
      </Text>)}
    </View>

    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPickerOpen(false)}>
        <View style={{ width: '74%', backgroundColor: '#232621', borderRadius: 28 * s, overflow: 'hidden' }}>
          {METHODS.map((m, i) => (
            <Pressable key={m.id} onPress={() => { setMethod(m); setPickerOpen(false); setErr(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 30 * s, paddingHorizontal: 34 * s,
                borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(245,241,230,0.12)', backgroundColor: m.id === method.id ? 'rgba(212,242,60,0.10)' : 'transparent' }}>
              <Text style={{ fontFamily: FONTS.interSemi, fontSize: 32 * s, color: COLORS.cream }}>{m.label}</Text>
              <PayLogo id={m.id} size={34 * s} circle />
            </Pressable>))}
        </View>
      </Pressable>
    </Modal>
  </>);
}
