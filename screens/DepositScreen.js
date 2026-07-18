// ── CARD DEPOSIT (DECISIONS 2026-06-04 + 06-14): real Checkout.com SANDBOX flow ──
// Buy credits (1 credit = $1, stored server-side as integer cents). The owner
// enters a test card, we tokenize it on the device against the Checkout SANDBOX
// tokens API with the PUBLIC key (safe to embed — public, single-use ~15min
// token), then POST { supabaseToken, amountCents, cardToken, idempotencyKey } to
// {httpsBase}/api/deposit. The server charges Checkout sandbox and credits the
// CAPTURED amount to the ledger (a `deposit` row). On success we toast the new
// balance, refresh, and pop to tabs; on decline we surface the server error.
//
// AUTH: /api/deposit STRICTLY requires a Supabase email-login JWT (server: A7
// "money requires email login" — body field `supabaseToken`, no device-token
// path). `supabaseToken` here is authToken(g) which is the Supabase JWT when the
// owner is signed in. If absent we block with a "sign in to deposit" message.
//
// Caps mirror the server: MIN_DEPOSIT_CENTS=50 ($0.50), MAX_DEPOSIT_CENTS=50000
// ($500). $500 is the per-deposit cap — $1000 = two $500 deposits.
//
// Keeps the batch6/depositstub.png aesthetic (ADD FUNDS headline, Anton, lime
// accents) but functional. Renders inside AppShell.
import React, { useState, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, InputAccessoryView, Keyboard, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';

// Checkout.com SANDBOX public key — PUBLIC, safe to embed (it can only tokenize a
// card, never move money). The SECRET key lives only in the server env.
const CKO_PUBLIC_KEY = 'pk_sbox_7axsqgrmlbrfhjwn2riew7sm4ey';
const CKO_TOKENS_URL = 'https://api.sandbox.checkout.com/tokens';

const MIN_CENTS = 50;       // $0.50  (server MIN_DEPOSIT_CENTS)
const MAX_CENTS = 50000;    // $500.00 (server MAX_DEPOSIT_CENTS, per-deposit cap)
const CHIP_CENTS = [500, 2500, 10000, 50000]; // $5 / $25 / $100 / $500

const dollars = (cents) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const digits = (s) => (s || '').replace(/\D+/g, '');

function genIdempotencyKey() {
  // unique per attempt so a retry can't double-charge (server passes it to
  // Checkout's Cko-Idempotency-Key)
  return 'dep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function CheckIcon({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke="#10140C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>);
}

export default function DepositScreen({
  httpsBase,                 // server base, e.g. https://web-production-c6ec6.up.railway.app
  supabaseToken = '',        // Supabase JWT (authToken(g)) — REQUIRED by /api/deposit
  signedInEmail = '',        // shown to the owner; server reads email from the JWT
  balance = '$0.00',         // current balance text (display only)
  onToast,                   // (text, kind?) => void
  onRefresh,                 // () => void — pull fresh balance + ledger after success
  onDone,                    // () => void — pop back to tabs
  onNeedDob,                 // (retry) => void — B48: server wants a DOB before first deposit
}) {
  const s = useScale();
  const [amountCents, setAmountCents] = useState(2500); // default $25
  const [custom, setCustom] = useState('');             // optional custom $ amount
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  // B50: Next on the keyboard toolbar hops fields (number-pad has no return key).
  const numberRef = useRef(null);
  const expiryRef = useRef(null);
  const cvvRef = useRef(null);
  const focusedField = useRef(null); // 'custom' | 'number' | 'expiry' | 'cvv'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canDeposit = !!supabaseToken;

  // ── input formatters ──────────────────────────────────────────────────────
  const onNumber = (t) => setNumber(digits(t).slice(0, 16).replace(/(.{4})/g, '$1 ').trim());
  const onExpiry = (t) => {
    const d = digits(t).slice(0, 4);
    setExpiry(d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d);
  };
  const onCvv = (t) => setCvv(digits(t).slice(0, 4));
  const onCustom = (t) => {
    // dollars with up to 2 decimals; selecting custom clears chip highlight
    const clean = (t || '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setCustom(clean);
    const v = Math.round(parseFloat(clean) * 100);
    if (Number.isFinite(v) && v > 0) setAmountCents(Math.min(v, MAX_CENTS));
  };

  const pickChip = (c) => { setAmountCents(c); setCustom(''); };

  // effective amount, clamped to [MIN,MAX]
  const effCents = Math.max(MIN_CENTS, Math.min(MAX_CENTS, amountCents || 0));

  const cardDigits = digits(number);
  const expDigits = digits(expiry);
  const expMonth = parseInt(expDigits.slice(0, 2), 10);
  const expYearRaw = expDigits.slice(2);
  const cardOk = cardDigits.length >= 14 && cardDigits.length <= 16;
  const expOk = expDigits.length === 4 && expMonth >= 1 && expMonth <= 12;
  const cvvOk = cvv.length >= 3 && cvv.length <= 4;
  const amountOk = effCents >= MIN_CENTS && effCents <= MAX_CENTS;
  const formOk = canDeposit && cardOk && expOk && cvvOk && amountOk && !busy;

  async function doDeposit() {
    if (!formOk) return;
    setErr('');
    setBusy(true);
    try {
      // 1) tokenize the card on the device (public key — can't move money)
      const expYear = expYearRaw.length === 2 ? 2000 + parseInt(expYearRaw, 10) : parseInt(expYearRaw, 10);
      let tokRes, tokJson;
      try {
        tokRes = await fetch(CKO_TOKENS_URL, {
          method: 'POST',
          headers: { Authorization: CKO_PUBLIC_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'card', number: cardDigits, expiry_month: expMonth, expiry_year: expYear, cvv }),
        });
        tokJson = await tokRes.json().catch(() => ({}));
      } catch (e) {
        throw new Error('Network error reaching card service. Try again.');
      }
      if (!tokRes.ok || !tokJson.token) {
        // Checkout returns error_codes / error_type on a bad card
        const code = (tokJson && (tokJson.error_codes && tokJson.error_codes[0])) || (tokJson && tokJson.error_type) || 'card_invalid';
        throw new Error('Card error: ' + code);
      }
      const cardToken = tokJson.token;

      // 2) charge via server: it captures on Checkout sandbox + credits the ledger
      const idempotencyKey = genIdempotencyKey();
      let depRes, depJson;
      try {
        depRes = await fetch(`${httpsBase}/api/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabaseToken, amountCents: effCents, cardToken, idempotencyKey }),
        });
        depJson = await depRes.json().catch(() => ({}));
      } catch (e) {
        throw new Error('Network error reaching the server. Try again.');
      }

      if (depRes.ok && depJson && depJson.ok) {
        const credited = Number.isInteger(depJson.creditedCents) ? depJson.creditedCents : effCents;
        const newBal = Number.isInteger(depJson.balanceCents) ? dollars(depJson.balanceCents) : balance;
        if (onToast) onToast(`DEPOSITED ${dollars(credited)} · NEW BALANCE ${newBal}`);
        if (onRefresh) onRefresh();   // pull the real balance + the new `deposit` ledger row
        if (onDone) onDone();         // pop back to tabs
        return;
      }

      // DOB GATE (B48): universal 18+ floor — the server asks for age verification on the
      // FIRST deposit. Open the DOB modal; on save it re-runs this same deposit (fields
      // are still filled in; the card re-tokenizes because Checkout tokens are one-use).
      if (depJson && depJson.needDob) {
        if (onNeedDob) { onNeedDob(() => doDeposit()); return; }
      }

      // map the server's error codes to a human message
      const e = depJson && depJson.error;
      const msg =
        e === 'charge_declined' ? ('Card declined' + (depJson.detail ? ' (' + depJson.detail + ')' : ''))
        : e === 'min_deposit' ? ('Minimum deposit is ' + dollars(depJson.minCents || MIN_CENTS))
        : e === 'max_deposit' ? ('Maximum deposit is ' + dollars(depJson.maxCents || MAX_CENTS))
        : e === 'email_required' || e === 'auth' ? 'Sign in with email to deposit'
        : e === 'missing_card_token' ? 'Card could not be processed — try again'
        : e || 'Deposit failed — try again';
      setErr(msg);
      if (onToast) onToast(msg, 'error');
    } catch (e) {
      setErr(e.message || 'Deposit failed — try again');
      if (onToast) onToast(e.message || 'Deposit failed — try again', 'error');
    } finally {
      setBusy(false);
    }
  }

  // ── shared styles ─────────────────────────────────────────────────────────
  const fieldStyle = {
    borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)', borderRadius: 16 * s,
    paddingVertical: 26 * s, paddingHorizontal: 32 * s, color: COLORS.cream,
    fontFamily: FONTS.interBold, fontSize: 34 * s, letterSpacing: 0.04 * 34 * s,
    backgroundColor: 'rgba(16,20,13,0.55)',
  };
  const labelStyle = {
    fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.creamDim,
    letterSpacing: 0.1 * 24 * s, marginBottom: 14 * s, marginLeft: 6 * s,
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }} keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={true}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark,
        textAlign: 'center', includeFontPadding: false, marginBottom: 16 * s }}>ADD FUNDS</Text>

      {/* balance line */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline',
        gap: 16 * s, marginBottom: 40 * s }}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s, color: COLORS.cream,
          letterSpacing: 0.08 * 32 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.lime }}>{balance}</Text>
      </View>

      {/* amount chips */}
      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>AMOUNT</Text>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 22 * s, flexDirection: 'row', flexWrap: 'wrap', gap: 22 * s }}>
        {CHIP_CENTS.map((c) => {
          const on = !custom && amountCents === c;
          return (
            <PressBtn key={c} onPress={() => pickChip(c)}
              style={{ width: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 46 * s,
                borderRadius: RADII.answer * s, borderWidth: 2 * s,
                borderColor: on ? COLORS.lime : 'rgba(215,248,74,0.4)',
                backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(16,20,13,0.82)' }}>
              <Text style={{ fontFamily: FONTS.anton, fontSize: 78 * s,
                color: on ? COLORS.lime : COLORS.cream, includeFontPadding: false }}>{dollars(c)}</Text>
            </PressBtn>);
        })}
      </View>

      {/* optional custom amount */}
      <View style={{ marginHorizontal: 45 * s, marginBottom: 36 * s }}>
        <TextInput placeholder="OR CUSTOM AMOUNT ($0.50–$500)" placeholderTextColor={COLORS.creamDim}
          value={custom ? '$' + custom : ''} onChangeText={onCustom} keyboardType="decimal-pad" inputAccessoryViewID="depDone"
          onFocus={() => { focusedField.current = 'custom'; }}
          style={[fieldStyle, custom ? { borderColor: COLORS.lime } : null]} />
      </View>

      {/* card fields */}
      <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>CARD NUMBER</Text>
      <View style={{ marginHorizontal: 45 * s, marginBottom: 26 * s }}>
        <TextInput placeholder="4242 4242 4242 4242" placeholderTextColor={COLORS.creamDim}
          value={number} onChangeText={onNumber} keyboardType="number-pad" maxLength={19} inputAccessoryViewID="depDone"
          ref={numberRef} onFocus={() => { focusedField.current = 'number'; }}
          style={fieldStyle} />
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 45 * s, gap: 22 * s, marginBottom: 30 * s }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>EXPIRY</Text>
          <TextInput placeholder="MM/YY" placeholderTextColor={COLORS.creamDim}
            value={expiry} onChangeText={onExpiry} keyboardType="number-pad" maxLength={5} inputAccessoryViewID="depDone"
            ref={expiryRef} onFocus={() => { focusedField.current = 'expiry'; }}
            style={fieldStyle} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>CVV</Text>
          <TextInput placeholder="100" placeholderTextColor={COLORS.creamDim}
            value={cvv} onChangeText={onCvv} keyboardType="number-pad" maxLength={4} secureTextEntry inputAccessoryViewID="depDone"
            ref={cvvRef} onFocus={() => { focusedField.current = 'cvv'; }}
            style={fieldStyle} />
        </View>
      </View>

      {/* keyboard Done toolbar (iOS number-pad has no return key) */}
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID="depDone">
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#1a1d14',
            paddingVertical: 16 * s, paddingHorizontal: 18 * s, borderTopWidth: 1, borderTopColor: 'rgba(215,248,74,0.25)' }}>
            <Pressable onPress={() => {
              const nx = focusedField.current === 'custom' ? numberRef
                : focusedField.current === 'number' ? expiryRef
                : focusedField.current === 'expiry' ? cvvRef : null;
              if (nx && nx.current) nx.current.focus(); else Keyboard.dismiss(); // CVV: nothing after it
            }} hitSlop={16}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 42 * s, color: COLORS.cream,
                paddingHorizontal: 22 * s, paddingVertical: 8 * s, marginRight: 14 * s }}>Next</Text>
            </Pressable>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={16}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 42 * s, color: COLORS.lime,
                paddingHorizontal: 22 * s, paddingVertical: 8 * s }}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      {/* SANDBOX hint */}
      <View style={{ marginHorizontal: 45 * s, marginBottom: 30 * s, backgroundColor: 'rgba(212,242,60,0.10)',
        borderWidth: 1.5 * s, borderColor: 'rgba(215,248,74,0.35)', borderRadius: 16 * s,
        paddingVertical: 20 * s, paddingHorizontal: 26 * s }}>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.lime,
          letterSpacing: 0.06 * 24 * s, marginBottom: 6 * s }}>SANDBOX</Text>
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim,
          letterSpacing: 0.02 * 24 * s }}>Test card 4242 4242 4242 4242 · any future expiry · CVV 100</Text>
      </View>

      {/* not-signed-in notice */}
      {!canDeposit ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.flameOut,
          textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 26 * s,
          letterSpacing: 0.04 * 26 * s }}>
          SIGN IN WITH EMAIL TO DEPOSIT REAL FUNDS</Text>
      ) : null}

      {/* error line */}
      {err ? (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.lose,
          textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 22 * s }}>{err}</Text>
      ) : null}

      {/* DEPOSIT $X */}
      <PressBtn onPress={doDeposit} disabled={!formOk}
        style={{ opacity: formOk ? 1 : 0.5, marginHorizontal: 45 * s, backgroundColor: COLORS.lime,
          borderRadius: RADII.cta * s, paddingVertical: 44 * s, alignItems: 'center',
          flexDirection: 'row', justifyContent: 'center', gap: 18 * s,
          shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
          shadowOpacity: 0.55, elevation: 10 }}>
        {busy ? <ActivityIndicator color="#10140C" /> : <CheckIcon size={48 * s} />}
        <Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C',
          letterSpacing: 0.03 * 60 * s, includeFontPadding: false }}>
          {busy ? 'PROCESSING…' : 'DEPOSIT ' + dollars(effCents)}</Text>
      </PressBtn>

      <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim,
        textAlign: 'center', letterSpacing: 0.06 * 22 * s, marginTop: 26 * s, marginHorizontal: 45 * s }}>
        {signedInEmail ? signedInEmail + ' · ' : ''}MAX $500 PER DEPOSIT</Text>
    </ScrollView>
  );
}
