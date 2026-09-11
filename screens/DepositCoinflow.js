// ── DEPOSIT via COINFLOW HOSTED CHECKOUT (B131; B133 = the Triumph-parity sheet) ────────────────
// A full-screen iOS sheet OVER the app — not a tab route — so nothing competes with it for height
// and the pay button is always the bottom-most thing on screen. Order matches Triumph exactly:
//   close · balance pill · amount · METHOD PILL · quick chips · keypad · pay button · terms
//
// Flow, and the one rule that matters:
//   amount settles → POST /api/deposit/intent { amountCents, idempotencyKey, method }
//     (server runs EVERY gate: $10 floor, per-deposit ceiling, geo, freeze, tier caps; creates the
//      deposits row; mints the Coinflow session key)
//   → Apple Pay / PayPal: the CTA is COINFLOW'S OWN hosted button for that brand, so the
//     mark is drawn by the brand's SDK (which is what their brand rules require) and it is one tap.
//     Cash App has no page at all (API-only per Coinflow's guide): POST /api/deposit/rail mints the
//     payment server-side and we deep-link out to it. Crypto still opens the checkout with only that method.
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
import { View, Text, Pressable, ActivityIndicator, Modal, Linking, Platform, Animated, Easing, Dimensions, AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { COLORS, FONTS, useScale } from './theme';
import PressBtn from './components/PressBtn';
import CoinflowPurchase, { CoinflowMethodButton, STANDALONE_METHODS } from './CoinflowPurchase';
import AmountKeypad, { toCents } from './components/AmountKeypad';
import PayLogo, { BRAND } from './components/PayLogo';
import * as clog from '../clientlog'; // B171: the button timeline goes to the server, not just console.log

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
const HANDOFF_RAILS = ['cashApp', 'venmo']; // no embeddable page — server mints, we open the URL
const POLL_MS = 2000, POLL_MAX_MS = 90000;   // B176: 90 s of FOREGROUND time — backgrounded time (in Venmo) no longer counts
// B176: the `sense://` URL scheme is registered by the NATIVE binary (app.json "scheme"), so only
// builds from this number up can be re-opened by Venmo's "return to the app" link. An older binary
// asked to open sense:// would get Safari's "cannot open the page" — so it never asks for one.
const DEEP_LINK_MIN_BUILD = 25;     // TestFlight build 25 (2026-09-11) is the first with CFBundleURLSchemes ['sense', …] — verified in its Info.plist
const DEEP_LINK_OK = Platform.OS === 'ios' && Number(Constants.nativeBuildVersion || 0) >= DEEP_LINK_MIN_BUILD;
const RETURN_PATH = 'deposit/return';
const INTENT_DEBOUNCE_MS = 400;   // only while the player is TYPING an amount; a chip tap or the sheet opening fires at once (B146)

const dollars = (cents) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

// Coinflow's theme object so the hosted checkout matches the app.
const CHECKOUT_THEME = {
  background: '#10140D', cardBackground: '#10140D', backgroundAccent: '#1A2418', backgroundAccent2: '#1A2418',
  textColor: '#F5F1E6', textColorAccent: 'rgba(245,241,230,0.7)', textColorAction: '#10140D', placeholderColor: 'rgba(245,241,230,0.4)',
  primary: '#D4F23C', ctaColor: '#D4F23C', style: 'rounded', fontSize: '18px', fontWeight: '600',
};

import { installId, installIdSync } from '../installId'; // B151: shared with App.js (register/queue carry it too)

// ── B160: prefetch ───────────────────────────────────────────────────────────────────────────────
// The button used to start its work when the sheet appeared, so the first second of the sheet was
// spent on our HTTP round trip and then Coinflow's page load, in series. The tap that OPENS the sheet
// starts the intent instead, so the round trip happens behind the modal's slide-in animation.
// Quiet by design: no location/DOB prompt can come out of this, and it only ever asks for the default
// amount. If the player types a different amount the component mints its own intent as before.
let PRE = null;  // { key, amountCents, nonce, promise, at, used }
const PRE_TTL_MS = 3 * 60 * 1000;        // under the server's 5-min session-key cache
const DEFAULT_AMOUNT = '10';
export function prefetchDepositIntent({ httpsBase, supabaseToken, amountCents = 1000 }) {
  if (!httpsBase || !supabaseToken) return;
  if (PRE && PRE.amountCents === amountCents && !PRE.used && Date.now() - PRE.at < PRE_TTL_MS) return;
  const nonce = Crypto.randomUUID();
  const idem = `${nonce}-${amountCents}`;
  const promise = (async () => {
    const deviceId = await installId();
    const res = await fetch(`${httpsBase}/api/deposit/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseToken, amountCents, idempotencyKey: idem, deviceId, method: 'applePay', build: clog.buildTag() || undefined }) });
    const j = await res.json().catch(() => null);
    return (res.ok && j && j.ok && !j.deduped) ? j : null;     // a deduped/in-flight row needs the component's polling, not a silent adopt
  })().catch(() => null);
  PRE = { amountCents, nonce, promise, at: Date.now(), used: false };
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

// B165: `visible` — the sheet is MOUNTED for the whole signed-in session and only revealed on the tap.
// Everything expensive (the deposit intent, Coinflow's session key, the Apple Pay page: ~1.3 MB, 41
// requests, ~2 s on a fast desktop and more on a phone) is done while the player is still on the home
// screen, so the tap just slides an already-live button in. A native Modal cannot do this — a hidden
// Modal unmounts its children — so the sheet is our own Animated overlay parked off-screen when hidden.
// Coinflow session keys are valid 24 h (docs.coinflow.cash quickstart), so a preloaded page stays good.
export default function DepositCoinflow({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', payments, onToast, onRefresh, onDone, onNeedDob, onNeedGps, visible = true }) {
  const s = useScale();
  const env = (payments && payments.coinflow && payments.coinflow.env) || 'sandbox';      // never default to prod
  const merchantId = (payments && payments.coinflow && payments.coinflow.merchantId) || 'sensegame';
  // 2026-09-11: the picker is server-driven now. Cash App is off in sandbox — Coinflow hands back
  // https://coinflow.cash (their homepage) instead of a cash.app/pay link, so the rail cannot be paid
  // and every tap used to lock the account out of every other rail. Falls back to the full list only
  // if the server said nothing, and can never offer a method METHODS doesn't know.
  const rails = Array.isArray(payments && payments.rails) && payments.rails.length ? payments.rails : null;
  const methods = rails ? METHODS.filter((m) => rails.includes(m.id)) : METHODS;
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [method, setMethod] = useState(METHODS[0]);   // reconciled against `methods` below once the server list lands
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lim, setLim] = useState(null);         // /api/deposit/limits
  const [intent, _setIntent] = useState(null);   // { depositId, amountCents, sessionKey, webhookInfo, checkout:{…} }
  // B175: React state is async, so `setIntent(null); await ensureIntent()` still saw the OLD intent and
  // handed the spent row straight back — which is why the openRail respin never reached :open and CJ
  // still had to press Venmo twice. Every read that decides "do I already have an intent" goes through
  // this ref, which updates in the same tick.
  const intentRef = useRef(null);
  const setIntent = useCallback((v) => { intentRef.current = typeof v === 'function' ? v(intentRef.current) : v; _setIntent(intentRef.current); }, []);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('amount'); // amount | checkout | processing
  const [err, setErr] = useState('');
  const [overlay, setOverlay] = useState(false); // PayPal/Venmo approval modal is open — it needs the whole sheet
  const inFlightRef = useRef(false);
  // One nonce per deposit attempt; the key sent to the server is nonce+amount, so changing the amount
  // mints a new key and re-trying the same amount replays the same intent.
  // B160: the METHOD is deliberately NOT part of the key or of the intent's identity. Coinflow's
  // session key and our webhookInfo are rail-independent, so one intent serves Apple Pay, PayPal and
  // Venmo at once — which is what lets all three buttons stay loaded and switching be instant. The
  // rail the player actually chose is reported separately (/api/deposit/method) for the books.
  const idemNonce = useRef((PRE && !PRE.used && Date.now() - PRE.at < PRE_TTL_MS) ? PRE.nonce : Crypto.randomUUID());
  const idemKey = (c) => `${idemNonce.current}-${c}`;
  const pollingRef = useRef(false);
  const intentTimer = useRef(null);
  const typedRef = useRef(false);   // B146: true while the last amount change came from the keypad
  const alive = useRef(true);
  useEffect(() => { installId(); return () => { alive.current = false; if (intentTimer.current) clearTimeout(intentTimer.current); }; }, []);
  // B176: time spent in Venmo / Cash App / Safari must not eat the poll budget. Track how long the app
  // was NOT active and credit it back to the poll loop's clock.
  const pausedMs = useRef(0); const bgAt = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { if (bgAt.current == null) bgAt.current = Date.now(); }
      else if (bgAt.current != null) { pausedMs.current += Date.now() - bgAt.current; bgAt.current = null; }
    });
    return () => sub.remove();
  }, []);
  // B176: sense://deposit/return?dep=…&rail=…&result=approved|cancel — Venmo's "return to the app" link
  // (and PayPal's returnUrl/cancelUrl if Coinflow ever hands us approvalLink). Credit still ONLY comes
  // from the signed Settled webhook; this just wakes the sheet up and stops a cancelled one spinning.
  const returnRef = useRef(null);
  useEffect(() => {
    const handle = (url) => {
      if (!url || typeof url !== 'string' || url.indexOf(RETURN_PATH) < 0) return;
      let q = {}; try { const qs = url.split('?')[1] || ''; qs.split('&').forEach((kv) => { const [k, v] = kv.split('='); if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || ''); }); } catch {}
      stamp((q.rail || 'rail') + ':return:' + (q.result || '?'));
      returnRef.current = { at: Date.now(), ...q };
      if (q.result === 'cancel') { cancelRail.current = true; }
    };
    const sub = Linking.addEventListener('url', (e) => handle(e && e.url));
    Linking.getInitialURL().then(handle).catch(() => {});
    return () => sub.remove();
  }, []);
  const cancelRail = useRef(false);
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
    idemNonce.current = Crypto.randomUUID();      // that deposit is done; the next one is a new attempt
    if (toastText && onToast) onToast(toastText, kind);
    if (onRefresh) onRefresh();
    close();
    setIntent(null); setAmount(DEFAULT_AMOUNT); typedRef.current = false; setPhase('amount'); setErr('');  // B165: preload the next one behind the scenes
  }, [onToast, onRefresh, close]);

  async function pollUntilSettled(depositId, expectCents) {
    if (pollingRef.current) return 'already';
    pollingRef.current = true; setPhase('processing');
    try {
      const t0 = Date.now(); const paused0 = pausedMs.current; cancelRail.current = false;
      while (alive.current && (Date.now() - t0) - (pausedMs.current - paused0) < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelRail.current) { cancelRail.current = false; setPhase('amount'); setErr('Cancelled — tap to try again'); return 'cancelled'; }
        let j = null;
        try { const r = await fetch(`${httpsBase}/api/deposit/status?id=${encodeURIComponent(depositId)}`, { headers: { Authorization: 'Bearer ' + supabaseToken } }); j = await r.json().catch(() => null); } catch { j = null; }
        if (!j || !j.status) continue;
        if (j.status === 'settled') { finish(`DEPOSITED ${dollars(j.settledCents || expectCents)}`); return 'settled'; }
        if (j.status === 'failed') { setErr('Payment declined — try another method'); setPhase('amount'); setIntent(null); idemNonce.current = Crypto.randomUUID(); return 'failed'; }
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
    if (intentRef.current && intentRef.current.amountCents === cents) return intentRef.current;
    inFlightRef.current = true; if (loud) setBusy(true);
    try {
      // The tap that opened the sheet may already have this in flight — join it instead of starting a second.
      if (PRE && !PRE.used && PRE.amountCents === cents && PRE.nonce === idemNonce.current && Date.now() - PRE.at < PRE_TTL_MS) {
        PRE.used = true;
        const pj = await PRE.promise;
        if (!alive.current) return null;
        if (pj && pj.ok) { const next = { ...pj }; setIntent(next); setErr(''); return next; }
      }
      const body = { supabaseToken, amountCents: cents, idempotencyKey: idemKey(cents), deviceId: await installId(), method: method.id, build: clog.buildTag() || undefined }; // B171: stamp the bundle on the deposits row
      const res = await fetch(`${httpsBase}/api/deposit/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!alive.current) return null;
      if (res.ok && j && j.ok) {
        if (j.deduped && j.status && j.status !== 'created' && j.status !== 'expired') { pollUntilSettled(j.depositId, cents); return null; }
        const next = { ...j }; setIntent(next); setErr(''); return next;
      }
      if (loud && j && j.needGps && onNeedGps) { onNeedGps(() => ensureIntent(true)); return null; }
      if (loud && j && j.needDob && onNeedDob) { onNeedDob(() => ensureIntent(true)); return null; }
      const code = j && j.error;
      setErr(res.status === 451 || res.status === 403 || res.status === 503 ? (code || 'Deposits are unavailable right now') : humanError(code, j));
      return null;
    } catch { if (alive.current && loud) setErr('Network error reaching the server — try again'); return null; }
    finally { if (alive.current) setBusy(false); inFlightRef.current = false; }
  }, [canDeposit, amountOk, cents, method, intent, supabaseToken, httpsBase, onNeedGps, onNeedDob]);

  // Debounced eager intent so the real Apple Pay button is mounted before the first tap.
  // NOTE: `method` is not a dependency any more (B160) — switching rails must not touch the intent.
  useEffect(() => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    if (phase !== 'amount' || !amountOk || !canDeposit) return;
    if (intent && intent.amountCents !== cents) setIntent(null);
    intentTimer.current = setTimeout(() => { ensureIntent(false); }, typedRef.current ? INTENT_DEBOUNCE_MS : 0);
    return () => { if (intentTimer.current) clearTimeout(intentTimer.current); };
  }, [cents, amountOk, canDeposit, phase]);

  // Tell the server which rail was actually chosen. Cosmetic (it only labels the deposits row for the
  // books), fire-and-forget, never gates the button.
  useEffect(() => {
    if (!intent || !intent.depositId || !supabaseToken) return;
    fetch(`${httpsBase}/api/deposit/method`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseToken, depositId: intent.depositId, method: method.id }) }).catch(() => {});
  }, [intent && intent.depositId, method.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // B160: every brand button stays mounted once it has been shown, so switching back to it is instant.
  // The SELECTED one mounts first and alone; the others follow once it has painted, so nothing competes
  // with it for bandwidth on the open.
  // B164: keyed on the METHOD only — a new intent is a new url loaded into the same WebView, and the
  // selected button is born as the inert placeholder and goes live in place. Nothing ever remounts.
  const [warm, setWarm] = useState([]);
  const depositId = intent && intent.depositId;
  useEffect(() => { if (STANDALONE_METHODS.includes(method.id)) setWarm((w) => (w.includes(method.id) ? w : [...w, method.id])); }, [method.id]);
  // If the server pulls the rail we're sitting on, fall back to the first one it still allows.
  useEffect(() => { if (rails && !rails.includes(method.id)) setMethod(methods[0] || METHODS[0]); }, [rails && rails.join(',')]);
  const warmRest = useCallback(() => { setWarm((w) => (w.length >= STANDALONE_METHODS.length ? w : STANDALONE_METHODS.slice())); }, []);
  // B164 DEBUG TIMELINE — only when the simulator rig (or CJ) sets AsyncStorage sense_debug_deposit=1.
  // Every phase of the button's life is stamped in ms since the sheet opened and drawn on screen, so a
  // screenshot IS the measurement. Invisible otherwise.
  const [dbg, setDbg] = useState(false);
  const t0 = useRef(Date.now());
  const [tl, setTl] = useState([]);
  useEffect(() => { AsyncStorage.getItem('sense_debug_deposit').then((v) => { if (alive.current && v === '1') setDbg(true); }).catch(() => {}); }, []);
  // B171: the SAME stamp that draws the debug line now also POSTs. Before this, every event that
  // explained a dead pay button lived in console.log on CJ's phone and died there — five Apple Pay
  // taps on 2026-09-11 left nothing behind but expired intents. sess groups one visit to the sheet.
  const sess = useRef(clog.newSession('dep'));
  const stamp = useCallback((label) => { const t = Date.now() - t0.current; console.log('[deposit-tl]', label, t); clog.logEvent('deposit', sess.current, label, t); setTl((x) => (x.length > 40 ? x : [...x, `${label}@${t}`])); }, []);
  useEffect(() => { if (depositId) stamp('intent:' + (PRE && PRE.used ? 'prefetched' : 'fresh')); }, [depositId]); // eslint-disable-line react-hooks/exhaustive-deps
  const H = Dimensions.get('window').height;
  const slide = useRef(new Animated.Value(visible ? 0 : H)).current;
  const wasVisible = useRef(visible);
  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 0 : H, duration: visible ? 320 : 240, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true }).start();
    if (visible && !wasVisible.current) {
      t0.current = Date.now(); setTl([]); sess.current = clog.newSession('dep'); // B171: one session per visit
      // Revealed. If the quiet preload could not get an intent (location prompt, DOB, network) ask loudly now.
      if (!intent && !inFlightRef.current) { setErr(''); ensureIntent(true); }
    }
    if (!visible && wasVisible.current) { clog.flush(); setPickerOpen(false); setOverlay(false); if (phase !== 'amount') { setPhase('amount'); setErr(''); } }
    wasVisible.current = visible;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPaid = useCallback(() => { if (intent) pollUntilSettled(intent.depositId, intent.amountCents); }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openSheet() { // non-Apple-Pay methods: Coinflow's checkout with only that method
    const it = intent && intent.amountCents === cents ? intent : await ensureIntent(true);
    if (it) setPhase('checkout');
  }

  // ── BROWSER HAND-OFF RAILS: Cash App (B172) + Venmo (B173) ───────────────────────────────────
  // Neither rail has a page we can embed. Cash App is API-only by Coinflow's own guide; Venmo has no
  // React Native button in their SDK at all (only the web SDK has CoinflowVenmoButton, and it needs a
  // DOM overlay element). Both follow the same shape: the SERVER mints the payment against this
  // deposit row and returns a URL, we open it outside the app, and the money is only ever credited by
  // the signed Settled webhook. Server-minted is stronger than the card path — the webhook matches on
  // payment_id rather than trusting a webhookInfo the phone supplied.
  // We start polling BEFORE handing off, so coming back lands on 'processing'.
  async function openRail(rail, retried = false, pre = null) {
    const label = rail === 'venmo' ? 'Venmo' : rail === 'cashApp' ? 'Cash App' : 'Crypto';
    const cur = pre || intentRef.current;
    const it = cur && cur.amountCents === cents ? cur : await ensureIntent(true);
    if (!it) return;
    setBusy(true); stamp(rail + ':mint');
    try {
      const r = await fetch(`${httpsBase}/api/deposit/rail`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseToken, depositId: it.depositId, rail, build: clog.buildTag() || undefined, deepLink: DEEP_LINK_OK || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!alive.current) return;
      const dest = j && (j.link || j.url);
      if (!r.ok || !j || !j.ok || !dest) {
        // A spent intent means this row already has a payment on it (they backed out to another rail).
        // Drop it and mint a fresh one rather than welding a second payment to the same row.
        // 2026-09-11: this used to setErr('Tap again…') and stop, so the tap AFTER any completed or
        // abandoned rail was always wasted — CJ: "makes me press twice every time". Mint the fresh
        // intent and carry on with the SAME tap. Guarded by `retried` so it can never loop.
        if (j && j.code === 'intent_spent') {
          setIntent(null); idemNonce.current = Crypto.randomUUID();
          if (retried) { setErr('Start a new deposit and try again'); return; }
          stamp(rail + ':respin');
          const fresh = await ensureIntent(true);
          if (!alive.current) return;
          if (!fresh) return;                       // ensureIntent already surfaced the reason
          return openRail(rail, true, fresh);
        }
        stamp(rail + ':mintFail:' + (r.status || 0));
        setErr(label + ' could not start — try another method'); return;
      }
      stamp(rail + ':open');
      pollUntilSettled(it.depositId, it.amountCents);   // phase -> 'processing'; only the server calls it settled
      Linking.openURL(dest).catch(() => { if (alive.current) setErr('Could not open ' + label); });
    } catch { if (alive.current) setErr('Network error reaching the server — try again'); }
    finally { if (alive.current) setBusy(false); }
  }

  const brand = BRAND[method.id] || BRAND.crypto;
  const ctaBase = { marginHorizontal: 45 * s, borderRadius: 44 * s, height: 140 * s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 16 * s };
  const shell = (children) => (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, elevation: 60, transform: [{ translateY: slide }] }}>
      {/* pageSheet look: a dim scrim, then the card with a rounded top sitting just under the status bar */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View style={{ flex: 1, marginTop: Platform.OS === 'ios' ? 54 : 30, backgroundColor: '#0B0E09', borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden',
        paddingTop: Platform.OS === 'ios' ? 18 * s : 30 * s,
        // B160: the pay button and the terms line used to sit on the home indicator; explicit inset (no safe-area-context here)
        paddingBottom: Platform.OS === 'ios' ? 34 : 12 }}>{children}</View>
    </Animated.View>);
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
            chargebackProtectionAccountType={c.chargebackProtectionAccountType} deviceId={installIdSync() || undefined} theme={CHECKOUT_THEME}
            onSuccess={onPaid} onExternalRedirect={onPaid}
            onAuthDeclined={(info) => setErr((info && (info.message || info.error)) ? String(info.message || info.error).slice(0, 120) : 'Payment declined — try another method')}
            onError={() => setErr('Checkout could not load — check your connection and go back')} />
        </View>
      )}
    </>);
  }

  // ── amount (Triumph order: close · balance · amount · METHOD · chips · keypad · pay · terms) ──
  const intentReady = !!(intent && intent.amountCents === cents);
  // Apple Pay / PayPal / Venmo have a real hosted button of their own; Cash App and crypto don't,
  // so those keep our labelled CTA that opens the checkout sheet.
  const isStandalone = STANDALONE_METHODS.includes(method.id) && amountOk && canDeposit;
  return shell(<>
    {overlay ? null : closeBtn}
    {dbg ? <Text style={{ fontFamily: FONTS.interSemi, fontSize: 16 * s, color: '#D4F23C', marginHorizontal: 30 * s }}>{tl.join('  ')}</Text> : null}
    {overlay ? null : balancePill}
    {overlay ? null : (<View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 200 * s, color: COLORS.cream, textAlign: 'center', includeFontPadding: false }} numberOfLines={1} adjustsFontSizeToFit>
        {amount ? '$' + amount : '$0'}</Text>
      {/* method pill sits directly under the amount — Triumph's position */}
      <View style={{ alignItems: 'center', marginTop: 40 * s }}>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 * s, paddingVertical: 20 * s, paddingHorizontal: 38 * s, borderRadius: 50 * s, backgroundColor: 'rgba(245,241,230,0.10)' }}>
          <PayLogo id={method.id} size={38 * s} />
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
          <Pressable key={c} onPress={() => { typedRef.current = false; setAmount(String(c / 100)); }} style={{ flex: 1, alignItems: 'center', paddingVertical: 26 * s, borderRadius: 40 * s,
            backgroundColor: on ? 'rgba(212,242,60,0.18)' : 'rgba(245,241,230,0.08)', borderWidth: on ? 2 * s : 0, borderColor: COLORS.lime }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: on ? COLORS.lime : COLORS.cream }}>{dollars(c)}</Text>
          </Pressable>); })}
      </View>)}

    {overlay ? null : <AmountKeypad value={amount} onChange={(v) => { typedRef.current = true; setAmount(v); }} maxCents={MAX_CENTS} allowCents={false} hideDisplay compact />}

    <View style={overlay ? { flex: 1 } : { marginBottom: 10 * s }}>
      {/* ONE button per method, never two. For Apple Pay / PayPal / Venmo the button is always
          Coinflow's real branded one; while the deposit intent is still being created there is
          nothing to point it at yet, so the same pill renders dimmed and inert and the live button
          drops straight into it. If the intent FAILED we fall through to a tappable retry, or the
          player would be staring at a dead button (a location prompt lands here, for instance). */}
      {isStandalone && (!err || intentReady) ? (
        // Coinflow's OWN hosted button for each brand — one tap, the brand's real mark and sheet.
        // B160: ALL the warmed brands render here; only the selected one is in the layout and tappable.
        // B164: keyed on the method, born inert, goes live in place when the intent lands.
        <View style={overlay ? { position: 'relative', flex: 1 } : { position: 'relative' }}>
          {(warm.length ? warm : [method.id]).map((mid) => {
            const sel = mid === method.id;
            const c = (intentReady && intent.checkout) || {};
            return (
              <CoinflowMethodButton key={mid} hidden={!sel} inert={!intentReady} inertColor={(BRAND[mid] || BRAND.crypto).bg} method={mid} color="white"
                height={mid === 'applePay' ? 140 * s : 49} radius={44 * s}   // 49pt = Coinflow's own #height-ref for the brand form pages (B161)
                expanded={sel && overlay} onOverlay={sel ? setOverlay : undefined}
                style={(sel && overlay) ? undefined : { marginHorizontal: 45 * s }}
                env={c.env || env} merchantId={c.merchantId || merchantId}
                sessionKey={intentReady ? intent.sessionKey : undefined} cents={intentReady ? intent.amountCents : undefined} webhookInfo={intentReady ? intent.webhookInfo : undefined}
                email={c.email || signedInEmail || undefined} deviceId={installIdSync() || undefined} theme={CHECKOUT_THEME} // B156: the server's email from the login, so Apple Pay never asks for one
                chargebackProtectionData={c.chargebackProtectionData} chargebackProtectionAccountType={c.chargebackProtectionAccountType}
                onLoad={sel ? warmRest : undefined} onEvent={(name) => stamp(mid + ':' + name)}
                onApprove={onPaid} onError={sel ? (() => setErr(method.label + ' could not start — try another method')) : undefined} />);
          })}
        </View>
      ) : (
        <PressBtn onPress={isStandalone ? () => ensureIntent(true) : (HANDOFF_RAILS.includes(method.id) ? () => openRail(method.id) : openSheet)} disabled={!canDeposit || !amountOk || busy}
          style={[ctaBase, { backgroundColor: brand.bg, opacity: (!canDeposit || !amountOk || busy) ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator color={brand.fg} /> : <PayLogo id={method.id} size={36 * s} on={brand.bg === '#FFFFFF' || brand.bg === COLORS.lime ? 'light' : 'dark'} />}
          <Text style={{ fontFamily: FONTS.interExtra, fontSize: 34 * s, color: brand.fg, letterSpacing: 0.04 * 34 * s }}>{isStandalone ? 'TRY AGAIN' : method.cta}</Text>
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
          {methods.map((m, i) => (
            <Pressable key={m.id} onPress={() => { setMethod(m); setPickerOpen(false); setErr(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 30 * s, paddingHorizontal: 34 * s,
                borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(245,241,230,0.12)', backgroundColor: m.id === method.id ? 'rgba(212,242,60,0.10)' : 'transparent' }}>
              <Text style={{ fontFamily: FONTS.interSemi, fontSize: 32 * s, color: COLORS.cream }}>{m.label}</Text>
              <PayLogo id={m.id} size={52 * s} />
            </Pressable>))}
        </View>
      </Pressable>
    </Modal>
  </>);
}
