// ── CARD DEPOSIT via COINFLOW (2026-09-08, COINFLOW-INTEGRATION.md §1; DECISIONS 2026-09-08) ──
// Replaces the Checkout.com form when the server says `payments.provider === 'coinflow'`
// (GET /api/tiers). Flow, and the one rule that matters:
//   card typed into Coinflow's hosted form (CoinflowCardForm, WebView) → token
//   → POST /api/deposit { token, expiry, name, billing address, idempotencyKey, deviceId }
//   → server charges → row `pending` → we POLL /api/deposit/status until Coinflow's signed
//     `Settled` webhook credits it. THE PHONE NEVER DECIDES THAT MONEY ARRIVED: success is
//     shown only when the server reports status `settled`. If polling times out, the balance
//     still updates by itself when the webhook lands (in_flight guard blocks a second charge).
// Name + billing address are required: Coinflow's fraud/chargeback protection scores them
// (AVS), and the server refuses a charge without a cardholder name.
// Errors from the server are CODES; the copy lives here — Coinflow's decline detail never
// reaches the phone (server keeps it in deposits.fail_reason).
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, InputAccessoryView, Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';
import CoinflowCardForm from './CoinflowCardForm';

const MIN_CENTS = 50;       // server MIN_DEPOSIT_CENTS
const DEFAULT_MAX = 50000;  // unverified tier ($500/deposit); the server's /api/deposit/limits is the truth (verified = $2,500)
const BASE_CHIPS = [500, 2500, 10000, 50000];
const POLL_MS = 2000, POLL_MAX_MS = 75000;

const dollars = (cents) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const digits = (s) => (s || '').replace(/\D+/g, '');

// Module constant: a new object per render would change the WebView URL and reload the form.
const FORM_THEME = {
  background: '#10140D', cardBackground: '#10140D', backgroundAccent: '#1A2418', backgroundAccent2: '#1A2418',
  textColor: '#F5F1E6', textColorAccent: 'rgba(245,241,230,0.7)', textColorAction: '#D4F23C', placeholderColor: 'rgba(245,241,230,0.4)',
  primary: '#D4F23C', ctaColor: '#D4F23C', style: 'rounded', fontSize: '18px', fontWeight: '600', showCardIcon: true,
};

let _installId = null;
async function installId() { // stable per install; Coinflow's x-device-id (chargeback protection) until their device SDK is wired
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
    case 'charge_declined': return 'Card declined — try another card';
    case 'needs_3ds': return 'This card needs extra bank verification, which is not supported yet — try another card';
    case 'cooldown': case 'rate_limited': return 'Too many attempts — try again in an hour';
    case 'in_flight': return 'A deposit is already processing — give it a minute';
    case 'cap_daily': return 'Daily deposit limit reached (' + dollars((j && j.capCents) || 50000) + ' per day)';
    case 'cap_monthly': return '30-day deposit limit reached (' + dollars((j && j.capCents) || 200000) + ')';
    case 'cap_lifetime': return 'Deposit limit reached — identity verification is needed to raise it';
    case 'balance_cap': return 'Balance limit reached (' + dollars((j && j.capCents) || 1000000) + ')';
    case 'charge_unavailable': case 'deposit_unavailable': return 'Payments are temporarily unavailable — try again shortly';
    case 'min_deposit': return 'Minimum deposit is ' + dollars((j && j.minCents) || MIN_CENTS);
    case 'max_deposit': return 'Maximum deposit is ' + dollars((j && j.maxCents) || MAX_CENTS);
    case 'email_required': case 'auth': return 'Sign in with email to deposit';
    case 'cardholder_required': case 'card_incomplete': case 'missing_card_token': return 'Fill in your name and card details';
    case 'idempotency_key_required': case 'idempotency_mismatch': case 'previous_attempt_failed': return 'Start a new deposit and try again';
    default: return code || 'Deposit failed — try again';
  }
}

function CheckIcon({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke="#10140C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>);
}

export default function DepositCoinflow({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', payments, onToast, onRefresh, onDone, onNeedDob }) {
  const s = useScale();
  const env = (payments && payments.coinflow && payments.coinflow.env) || 'sandbox';      // never default to prod
  const merchantId = (payments && payments.coinflow && payments.coinflow.merchantId) || 'sensegame';
  const [amountCents, setAmountCents] = useState(2500);
  const [custom, setCustom] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address1, setAddress1] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [zip, setZip] = useState('');
  const [formReady, setFormReady] = useState(false);
  const [lim, setLim] = useState(null);         // { tier, maxCents, remainingTodayCents, verifiedTier } from /api/deposit/limits
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');   // idle | charging | processing
  const [err, setErr] = useState('');
  const cardRef = useRef(null);
  const inFlightRef = useRef(false);   // synchronous double-tap guard (2026-08-24 lesson)
  const idemRef = useRef(null);        // one idempotency key per ATTEMPT: a retry after a network blip replays, never re-charges
  const alive = useRef(true);
  const lastRef = useRef(null); const addrRef = useRef(null); const cityRef = useRef(null); const stRef = useRef(null); const zipRef = useRef(null);
  useEffect(() => { installId(); return () => { alive.current = false; }; }, []);
  useEffect(() => { // caps are tiered on identity verification (2026-09-09) — ask the server, never assume
    if (!supabaseToken) return;
    fetch(`${httpsBase}/api/deposit/limits`, { headers: { Authorization: 'Bearer ' + supabaseToken } }).then((r) => r.json()).then((j) => { if (alive.current && j && j.ok) setLim(j); }).catch(() => {});
  }, [supabaseToken]);
  const MAX_CENTS = (lim && lim.maxCents) || DEFAULT_MAX;
  const CHIP_CENTS = MAX_CENTS >= 250000 ? [...BASE_CHIPS, 100000, 250000] : BASE_CHIPS;

  const canDeposit = !!supabaseToken;
  const onCustom = (t) => {
    const clean = (t || '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setCustom(clean);
    const v = Math.round(parseFloat(clean) * 100);
    if (Number.isFinite(v) && v > 0) setAmountCents(Math.min(v, MAX_CENTS));
  };
  const pickChip = (c) => { setAmountCents(c); setCustom(''); };
  const effCents = Math.max(MIN_CENTS, Math.min(MAX_CENTS, amountCents || 0));
  const nameOk = firstName.trim().length >= 1 && lastName.trim().length >= 1;
  const addrOk = address1.trim().length >= 3 && city.trim().length >= 2 && /^[A-Za-z]{2}$/.test(stateCode.trim()) && /^\d{5}$/.test(digits(zip));
  const amountOk = effCents >= MIN_CENTS && effCents <= MAX_CENTS;
  const formOk = canDeposit && nameOk && addrOk && amountOk && formReady && !busy;

  const finish = useCallback((toastText, kind) => {
    idemRef.current = null;
    if (toastText && onToast) onToast(toastText, kind);
    if (onRefresh) onRefresh();
    if (onDone) onDone();
  }, [onToast, onRefresh, onDone]);

  async function pollUntilSettled(depositId) {
    const t0 = Date.now();
    while (alive.current && Date.now() - t0 < POLL_MAX_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      let j = null;
      try { const r = await fetch(`${httpsBase}/api/deposit/status?id=${encodeURIComponent(depositId)}`, { headers: { Authorization: 'Bearer ' + supabaseToken } }); j = await r.json().catch(() => null); } catch { j = null; }
      if (!j || !j.status) continue;
      if (j.status === 'settled') { finish(`DEPOSITED ${dollars(j.settledCents || effCents)} · NEW BALANCE ${Number.isInteger(j.balanceCents) ? dollars(j.balanceCents) : balance}`); return 'settled'; }
      if (j.status === 'failed') { idemRef.current = null; setErr('Card declined — try another card'); return 'failed'; }
      if (j.status === 'review') { finish('Deposit under review — it will be credited once confirmed', 'error'); return 'review'; }
      if (j.status === 'amount_mismatch') { finish('Deposit on hold — support will sort it out', 'error'); return 'held'; }
      // created / unknown / pending / authorized: keep waiting
    }
    if (alive.current) finish('Still processing — your balance updates automatically once the bank confirms', 'error');
    return 'timeout';
  }

  async function doDeposit() {
    if (!formOk) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErr(''); setBusy(true); setPhase('charging');
    try {
      // 1) token from Coinflow's form (card number never enters our code)
      let tok;
      try { tok = await cardRef.current.tokenize(); }
      catch (e) {
        const m = String((e && e.message) || '');
        throw new Error(m === 'card_form_not_ready' ? 'Card form is still loading — try again' : m === 'card_form_timeout' ? 'Card service did not answer — try again' : 'Check the card number, expiry and CVV');
      }
      if (!tok || !tok.token) throw new Error('Check the card number, expiry and CVV');
      if (!tok.expMonth || !tok.expYear) throw new Error('Card expiry is missing — re-enter the card');
      // 2) charge via our server (caps, geo, freeze checks live there; nothing is credited yet)
      if (!idemRef.current) idemRef.current = Crypto.randomUUID();
      const body = { supabaseToken, amountCents: effCents, cardToken: tok.token, expMonth: String(tok.expMonth), expYear: String(tok.expYear),
        firstName: firstName.trim(), lastName: lastName.trim(), address1: address1.trim(), city: city.trim(), state: stateCode.trim().toUpperCase(), zip: digits(zip), country: 'US',
        idempotencyKey: idemRef.current, deviceId: await installId(), forterToken: tok.forterToken || undefined };
      let res, j;
      try { res = await fetch(`${httpsBase}/api/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await res.json().catch(() => ({})); }
      catch { throw new Error('Network error reaching the server — try again (your card was not charged twice)'); } // idem key kept: the retry replays the same attempt
      if (res.ok && j && j.ok) {
        if (!j.pending && j.status === 'settled') { finish(`DEPOSITED ${dollars(effCents)}`); return; }
        setPhase('processing');
        await pollUntilSettled(j.depositId);
        return;
      }
      if (j && j.needDob) { if (onNeedDob) { onNeedDob(() => doDeposit()); return; } }
      const code = j && j.error;
      if (code !== 'charge_unavailable') idemRef.current = null;   // unknown outcome keeps the key so a retry replays instead of re-charging
      const msg = res.status === 451 || res.status === 403 || res.status === 503 ? (code || 'Deposits are unavailable right now') : humanError(code, j);
      setErr(msg); if (onToast) onToast(msg, 'error');
    } catch (e) {
      setErr(e.message || 'Deposit failed — try again'); if (onToast) onToast(e.message || 'Deposit failed — try again', 'error');
    } finally {
      if (alive.current) { setBusy(false); setPhase('idle'); }
      inFlightRef.current = false;
    }
  }

  const fieldStyle = {
    borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)', borderRadius: 16 * s,
    paddingVertical: 26 * s, paddingHorizontal: 32 * s, color: COLORS.cream,
    fontFamily: FONTS.interBold, fontSize: 34 * s, letterSpacing: 0.04 * 34 * s, backgroundColor: 'rgba(16,20,13,0.55)',
  };
  const labelStyle = { fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.1 * 24 * s, marginBottom: 14 * s, marginLeft: 6 * s };
  const input = (props) => (
    <TextInput placeholderTextColor={COLORS.creamDim} autoCorrect={false} returnKeyType="next" blurOnSubmit={false} style={fieldStyle} {...props} />
  );
  const ctaText = phase === 'processing' ? 'CONFIRMING WITH BANK…' : busy ? 'CHARGING…' : 'DEPOSIT ' + dollars(effCents);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark, textAlign: 'center', includeFontPadding: false, marginBottom: 16 * s }}>ADD FUNDS</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 16 * s, marginBottom: 40 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, color: COLORS.cream, letterSpacing: 0.08 * 32 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.lime }}>{balance}</Text>
      </View>

      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>AMOUNT</Text>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 22 * s, flexDirection: 'row', flexWrap: 'wrap', gap: 22 * s }}>
        {CHIP_CENTS.map((c) => { const on = !custom && amountCents === c; return (
          <PressBtn key={c} onPress={() => pickChip(c)} style={{ width: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 46 * s, borderRadius: RADII.answer * s, borderWidth: 2 * s,
            borderColor: on ? COLORS.lime : 'rgba(215,248,74,0.4)', backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(16,20,13,0.82)' }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 78 * s, color: on ? COLORS.lime : COLORS.cream, includeFontPadding: false }}>{dollars(c)}</Text>
          </PressBtn>); })}
      </View>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 36 * s }}>
        <TextInput placeholder={`OR CUSTOM AMOUNT ($0.50–${dollars(MAX_CENTS)})`} placeholderTextColor={COLORS.creamDim} value={custom ? '$' + custom : ''} onChangeText={onCustom}
          keyboardType="decimal-pad" inputAccessoryViewID="cfDone" style={[fieldStyle, custom ? { borderColor: COLORS.lime } : null]} />
      </View>

      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>NAME ON CARD</Text>
      <View style={{ flexDirection: 'row', marginHorizontal: 45 * s, gap: 22 * s, marginBottom: 26 * s }}>
        <View style={{ flex: 1 }}>{input({ placeholder: 'First', value: firstName, onChangeText: setFirstName, textContentType: 'givenName', autoCapitalize: 'words', onSubmitEditing: () => lastRef.current && lastRef.current.focus() })}</View>
        <View style={{ flex: 1 }}>{input({ ref: lastRef, placeholder: 'Last', value: lastName, onChangeText: setLastName, textContentType: 'familyName', autoCapitalize: 'words', onSubmitEditing: () => addrRef.current && addrRef.current.focus() })}</View>
      </View>

      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>BILLING ADDRESS</Text>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 22 * s }}>{input({ ref: addrRef, placeholder: 'Street address', value: address1, onChangeText: setAddress1, textContentType: 'streetAddressLine1', autoCapitalize: 'words', onSubmitEditing: () => cityRef.current && cityRef.current.focus() })}</View>
      <View style={{ flexDirection: 'row', marginHorizontal: 45 * s, gap: 22 * s, marginBottom: 30 * s }}>
        <View style={{ flex: 2 }}>{input({ ref: cityRef, placeholder: 'City', value: city, onChangeText: setCity, textContentType: 'addressCity', autoCapitalize: 'words', onSubmitEditing: () => stRef.current && stRef.current.focus() })}</View>
        <View style={{ flex: 1 }}>{input({ ref: stRef, placeholder: 'ST', value: stateCode, onChangeText: (t) => setStateCode((t || '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()), textContentType: 'addressState', autoCapitalize: 'characters', maxLength: 2, onSubmitEditing: () => zipRef.current && zipRef.current.focus() })}</View>
        <View style={{ flex: 1.3 }}>{input({ ref: zipRef, placeholder: 'ZIP', value: zip, onChangeText: (t) => setZip(digits(t).slice(0, 5)), textContentType: 'postalCode', keyboardType: 'number-pad', maxLength: 5, inputAccessoryViewID: 'cfDone', returnKeyType: 'done', blurOnSubmit: true })}</View>
      </View>

      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>CARD</Text>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, borderWidth: 2 * s, borderColor: formReady ? 'rgba(215,248,74,0.5)' : 'rgba(215,248,74,0.25)', borderRadius: 16 * s,
        backgroundColor: '#10140D', paddingVertical: 10 * s, paddingHorizontal: 12 * s, overflow: 'hidden', minHeight: 56 + 20 * s }}>
        <CoinflowCardForm ref={cardRef} merchantId={merchantId} env={env} theme={FORM_THEME}
          onLoad={() => setFormReady(true)}
          onError={() => { setFormReady(false); setErr('Card form could not load — check your connection and reopen this screen'); }} />
      </View>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID="cfDone">
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#1a1d14', paddingVertical: 16 * s, paddingHorizontal: 18 * s, borderTopWidth: 1, borderTopColor: 'rgba(215,248,74,0.25)' }}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={16}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 42 * s, color: COLORS.lime, paddingHorizontal: 22 * s, paddingVertical: 8 * s }}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      {env !== 'prod' ? (
        <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, backgroundColor: 'rgba(212,242,60,0.10)', borderWidth: 1.5 * s, borderColor: 'rgba(215,248,74,0.35)', borderRadius: 16 * s, paddingVertical: 20 * s, paddingHorizontal: 26 * s }}>
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.lime, letterSpacing: 0.06 * 24 * s, marginBottom: 6 * s }}>SANDBOX</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.02 * 24 * s }}>Test card 4242 4242 4242 4242 · any future expiry · CVV 123 · ZIP 99999 = decline</Text>
        </View>
      ) : null}

      {!canDeposit ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.flameOut, textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 26 * s, letterSpacing: 0.04 * 26 * s }}>SIGN IN WITH EMAIL TO DEPOSIT REAL FUNDS</Text>
      ) : null}
      {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: '#FF5A48', textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 22 * s }}>{err}</Text>) : null}

      <PressBtn onPress={doDeposit} disabled={!formOk}
        style={{ opacity: formOk ? 1 : 0.5, marginHorizontal: 45 * s, backgroundColor: COLORS.lime, borderRadius: RADII.cta * s, paddingVertical: 44 * s, alignItems: 'center',
          flexDirection: 'row', justifyContent: 'center', gap: 18 * s, shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s, shadowOpacity: 0.55, elevation: 10 }}>
        {busy ? <ActivityIndicator color="#10140C" /> : <CheckIcon size={48 * s} />}
        <Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C', letterSpacing: 0.03 * 60 * s, includeFontPadding: false }}>{ctaText}</Text>
      </PressBtn>

      <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.06 * 22 * s, marginTop: 26 * s, marginHorizontal: 45 * s }}>
        {signedInEmail ? signedInEmail + ' · ' : ''}MAX {dollars(MAX_CENTS)} PER DEPOSIT{lim && Number.isInteger(lim.remainingTodayCents) ? ' · ' + dollars(lim.remainingTodayCents) + ' LEFT TODAY' : ''} · SECURED BY COINFLOW</Text>
      {lim && lim.tier !== 'verified' && lim.verifiedTier ? (
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.04 * 22 * s, marginTop: 10 * s, marginHorizontal: 45 * s }}>
          VERIFY YOUR IDENTITY (PROFILE → WITHDRAW → VERIFY) TO RAISE LIMITS TO {dollars(lim.verifiedTier.maxCents)} PER DEPOSIT · {dollars(lim.verifiedTier.dayCents)} PER DAY</Text>
      ) : null}
    </ScrollView>
  );
}
