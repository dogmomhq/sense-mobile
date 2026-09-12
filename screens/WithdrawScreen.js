// ── WITHDRAW (B132, 2026-09-10 — Triumph-style transfer-method list; supersedes the 2026-09-09 chip form) ──
// The phone never decides anything about money here. It:
//   1. asks the server what is withdrawable (balance − not-yet-played deposits/bonuses) and what Coinflow knows
//      (KYC state, linked PayPal / Venmo / card / bank) — GET /api/withdraw/status
//   2. all four transfer methods are ALWAYS listed, linked or not (Triumph's shape, CJ 2026-09-10).
//      Tapping one either uses it or collects where the money should go:
//        PayPal → native email sheet → POST /api/withdraw/link/paypal (their API, no WebView)
//        Venmo / Debit card / Bank → Coinflow's hosted page filtered to THAT method
//      A linked row shows the account inline and goes straight to the amount keypad.
//      Identity verification (one-time) happens on the hosted page before any of it.
//   3. amount keypad → fee quote (GET /api/withdraw/quote — the Sense schedule: 3% min $2, bank free)
//   4. step-up (fresh email code, or Apple re-auth for Apple accounts — B129) → POST /api/withdraw.
// First withdrawal, anything ≥ $500 or a destination linked < 24 h ago waits for CJ's approval — the server says so.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, Platform, Keyboard, Linking } from 'react-native';
import WebView from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabaseClient';
import { COLORS, FONTS, RADII, useScale } from './theme';
import PressBtn from './components/PressBtn';
import AmountKeypad, { toCents } from './components/AmountKeypad';
import PayLogo from './components/PayLogo';

const LINK_RETURN = 'https://dogmomhq.github.io/sense-legal/linked.html'; // Coinflow bounces here after linking; we intercept it
const RED = '#FF5A48';
const dollars = (c) => '$' + (Math.abs(c) % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
const digits = (s) => (s || '').replace(/\D+/g, '');

// Per-destination copy for the LINKED rows. Fee/speed mirror lib/withdraw-fees.js (3% min $2; bank
// free) — the picker itself is Coinflow's page, so this is only what we say about what you linked.
// B184 (CJ): no "Powered by Coinflow" on their picker. Their page renders that footer unless the
// merchant flag `hideBranding` is on (their bundle: `merchant.hideBranding ? null : <PoweredBy/>`),
// which only Coinflow can set. Until they do, hide it in our WebView: any element whose own text
// is "Powered by" and its row. It's a SPA, so watch for re-renders.
const HIDE_POWERED_BY = `(function(){function hide(){try{var els=document.querySelectorAll('span,div,p');for(var i=0;i<els.length;i++){var e=els[i];if(e.children.length===0&&/^\\s*Powered by\\s*$/i.test(e.textContent||'')){var box=e.parentElement;for(var k=0;k<3&&box&&box.parentElement&&box.parentElement.children.length===1;k++)box=box.parentElement;box.style.display='none';}}}catch(x){}}hide();new MutationObserver(hide).observe(document.documentElement,{childList:true,subtree:true});})();true;`;
const METHODS = [
  { kind: 'paypal', title: 'PayPal',       fee: '3% or $2 min',  speed: 'INSTANT'  },
  { kind: 'venmo',  title: 'Venmo',        fee: '3% or $2 min',  speed: 'INSTANT'  },
  { kind: 'card',   title: 'Debit card',   fee: '3% or $2 min',  speed: 'INSTANT'  },
  { kind: 'bank',   title: 'Bank account', fee: 'No fee',        speed: '1–3 DAYS' },
];
const methodFor = (k) => METHODS.find((m) => m.kind === k) || { title: k, fee: '', speed: '' };
const speedLabel = (sp) => sp === 'card' || sp === 'asap' || sp === 'paypal' || sp === 'venmo' ? 'INSTANT' : sp === 'same_day' ? 'SAME DAY' : '1–3 DAYS';
const kindLabel = (k) => (METHODS.find((m) => m.kind === k) || {}).title || k;

function humanError(code, j) {
  switch (code) {
    case 'otp_required': return 'Enter the code we emailed you';
    case 'kyc_required': return 'Finish identity verification first';
    case 'payout_blocked': return 'Payouts are paused on your account — contact support';
    case 'destination_unknown': case 'destination_required': return 'Pick a transfer method';
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
    case 'bad_email': return 'Enter the email on your PayPal account';
    case 'link_failed': return 'PayPal could not be linked — check the email and try again';
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

export default function WithdrawScreen({ httpsBase, supabaseToken = '', signedInEmail = '', balance = '$0.00', onToast, onRefresh, onDone }) {
  const s = useScale();
  const [st, setSt] = useState(null);          // /api/withdraw/status
  const [loadErr, setLoadErr] = useState('');
  const [linkUrl, setLinkUrl] = useState(null); // hosted KYC + link page open
  const [paypalSheet, setPaypalSheet] = useState(false); const [paypalEmail, setPaypalEmail] = useState('');
  // B178 NATIVE KYC (CJ 2026-09-11, Skillz/Triumph-style): our own sheet at the first withdrawal —
  // name (pre-filled from the DOB screen), address, SSN last 4 → POST /api/kyc/register → Coinflow's
  // instant check. Most players are approved on the spot and go straight to picking a method. The
  // SSN digits go to the server and on to Coinflow; they are never stored, never logged, never shown again.
  const [venmoSheet, setVenmoSheet] = useState(false); const [venmoPhone, setVenmoPhone] = useState('');   // B181: link / change Venmo by phone
  // B183 NATIVE DEBIT CARD (CJ: "we don't need the extra step"): Coinflow's secure card field
  // (/form/v2/card-form — number, expiry, CVV live on THEIR page, the number never touches us) sits
  // inside OUR sheet. Protocol from coinflow-react-native CoinflowCardFormV2: page posts
  // {method:'loaded'|'heightChange'|'tokenize'}; we post 'tokenize' and get {token, expMonth, expYear}.
  const [cardSheet, setCardSheet] = useState(false); const [cardReady, setCardReady] = useState(false); const [cardH, setCardH] = useState(260);
  const cardWv = useRef(null);
  const [kycSheet, setKycSheet] = useState(false); const [kycPending, setKycPending] = useState(null); // {kind} the player tapped, resumed after approval
  const [kyc, setKyc] = useState({ first: '', last: '', address: '', city: '', state: '', zip: '', ssn4: '' });
  const [dest, setDest] = useState(null);       // chosen destination object
  const [amount, setAmount] = useState('');     // keypad string
  const [quote, setQuote] = useState(null);     // { feeCents, netCents, speed }
  const [phase, setPhase] = useState('list');   // list | amount | code | done
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [isApple, setIsApple] = useState(false); // B129: Apple accounts step up via Apple re-auth, not email code
  const idemRef = useRef(null); const inFlightRef = useRef(false); const alive = useRef(true); const quoteTimer = useRef(null);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { (async () => { try { const { data } = await supabase.auth.getSession(); const u = data && data.session && data.session.user; const prov = String((u && u.app_metadata && (u.app_metadata.provider || (u.app_metadata.providers || [])[0])) || ''); setIsApple(prov === 'apple'); } catch {} })(); }, []);

  const hdr = { Authorization: 'Bearer ' + supabaseToken };
  const load = useCallback(async (fresh) => {
    setLoadErr('');
    try {
      const r = await fetch(`${httpsBase}/api/withdraw/status${fresh ? '?fresh=1' : ''}`, { headers: hdr }); const j = await r.json().catch(() => null);
      if (!alive.current) return;
      if (!r.ok || !j) { setLoadErr(humanError(j && j.error)); return; }
      setSt(j);
      if (dest && !(j.destinations || []).find((d) => d.token === dest.token)) setDest(null);
    } catch { if (alive.current) setLoadErr('Network error — pull to retry'); }
  }, [httpsBase, supabaseToken, dest]);
  useEffect(() => { load(false); }, []);

  const cents = toCents(amount);
  const withdrawable = st ? st.withdrawableCents : 0;
  const minCents = (st && st.limits && st.limits.minCents) || 1000;
  const amountOk = cents >= minCents && cents <= withdrawable;
  const ready = !!(st && st.enabled && st.verified && dest && amountOk && !busy);
  const linkedFor = (kind) => (st && st.destinations ? st.destinations.filter((d) => d.kind === kind) : []);

  // fee quote, debounced
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuote(null);
    if (!dest || !amountOk) return;
    quoteTimer.current = setTimeout(async () => {
      try { const r = await fetch(`${httpsBase}/api/withdraw/quote?token=${encodeURIComponent(dest.token)}&cents=${cents}`, { headers: hdr }); const j = await r.json().catch(() => null); if (alive.current && j && j.ok) setQuote({ feeCents: j.feeCents, netCents: j.netCents, receiveCents: j.receiveCents, speed: j.speed }); } catch {}
    }, 400);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [dest, cents, amountOk]);

  async function openLink(method) { // Venmo / card / bank (and identity verification) — Coinflow's hosted page
    setErr('');
    try { const r = await fetch(`${httpsBase}/api/withdraw/link-url?method=${encodeURIComponent(method || 'all')}&redirect=${encodeURIComponent(LINK_RETURN)}`, { headers: hdr }); const j = await r.json().catch(() => null); if (!r.ok || !j || !j.url) { setErr(humanError(j && j.error)); return; } setLinkUrl(j.url); }
    catch { setErr('Network error — try again'); }
  }
  async function linkDone(msg) {
    const before = new Set((st && st.destinations ? st.destinations : []).map((d) => d.token));
    setLinkUrl(null); if (onToast && msg) onToast(msg);
    await load(true);
    // Whatever they just linked becomes the destination — no second pick, same as tapping a row.
    try {
      const r = await fetch(`${httpsBase}/api/withdraw/status?fresh=1`, { headers: hdr }); const j = await r.json().catch(() => null);
      const added = j && j.destinations ? j.destinations.find((d) => !before.has(d.token)) : null;
      if (added && alive.current) useDestination(added);
    } catch {}
  }
  async function linkVenmo() { // B181: phone → server → Coinflow add-Venmo (replaces the auto-linked one)
    if (inFlightRef.current) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      const r = await fetch(`${httpsBase}/api/withdraw/link/venmo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseToken, phone: venmoPhone.replace(/\D/g, '') }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error === 'bad_phone' ? 'Enter the 10-digit US phone on your Venmo' : j.error === 'venmo_not_enabled' ? 'Venmo payouts are not enabled yet' : humanError(j.error, j)); return; }
      setVenmoSheet(false); setVenmoPhone(''); if (onToast) onToast('Venmo updated');
      await load(true);
      const vm = (j.destinations || []).find((d) => d.kind === 'venmo'); if (vm) { setDest(vm); setPhase('amount'); }
    } catch { setErr('Network error — try again'); }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  // B181: "Change" on a linked row. Venmo/PayPal re-link natively; bank/card go back to Coinflow's page.
  function changeMethod(m) {
    setErr('');
    if (m.kind === 'venmo') { setVenmoPhone(''); setVenmoSheet(true); return; }
    if (m.kind === 'paypal') { setPaypalEmail(signedInEmail || ''); setPaypalSheet(true); return; }
    if (m.kind === 'card') { setCardReady(false); setCardSheet(true); return; }
    openLink(m.kind);
  }
  async function linkCard() { // B183: ask Coinflow's field for a token, then link it by API
    if (inFlightRef.current || !cardWv.current) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      const tok = await new Promise((resolve, reject) => { cardTokRef.current = { resolve, reject }; cardWv.current.postMessage('tokenize'); setTimeout(() => { if (cardTokRef.current) { cardTokRef.current = null; reject(new Error('timeout')); } }, 20000); });
      const r = await fetch(`${httpsBase}/api/withdraw/link/card`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseToken, cardToken: tok.token, expMonth: String(tok.expMonth || '').padStart(2, '0'), expYear: String(tok.expYear || '').slice(-2) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error === 'card_ineligible' ? 'This card can\'t receive instant payouts — try another debit card' : j.error === 'address_required' ? 'Finish identity verification first' : humanError(j.error, j)); return; }
      setCardSheet(false); if (onToast) onToast('Card linked');
      await load(true);
      const cd = (j.destinations || []).find((d) => d.kind === 'card'); if (cd) { setDest(cd); setPhase('amount'); }
    } catch (e) { setErr(String(e && e.message || '').startsWith('Card') ? 'Check the card details' : 'Check the card details and try again'); }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  const cardTokRef = useRef(null);
  function onCardMsg(ev) {
    let m = null; try { m = JSON.parse(ev.nativeEvent.data); } catch { return; }
    if (m.method === 'loaded') setCardReady(true);
    if (m.method === 'heightChange') { const h = Number(m.data); if (Number.isFinite(h) && h > 40) setCardH(Math.min(h, 520)); }
    if (m.method === 'tokenize' && cardTokRef.current) {
      const { resolve, reject } = cardTokRef.current; cardTokRef.current = null;
      if (typeof m.data === 'string' && m.data.startsWith('ERROR')) return reject(new Error(m.data.replace('ERROR ', '')));
      try { resolve(typeof m.data === 'string' ? JSON.parse(m.data) : m.data); } catch (e) { reject(e); }
    }
  }
  async function linkPaypal() { // native: email → server → Coinflow add-PayPal
    if (inFlightRef.current) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      const r = await fetch(`${httpsBase}/api/withdraw/link/paypal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseToken, email: paypalEmail.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(humanError(j.error, j)); return; }
      setPaypalSheet(false); setPaypalEmail(''); if (onToast) onToast('PayPal linked');
      await load(true);
      const pp = (j.destinations || []).find((d) => d.kind === 'paypal'); if (pp) { setDest(pp); setPhase('amount'); }
    } catch { setErr('Network error — try again'); }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  function useDestination(d) { setErr(''); setDest(d); setAmount(''); setPhase('amount'); }
  function tapMethod(m) {
    setErr('');
    if (!st || !st.enabled) return;
    const linked = linkedFor(m.kind)[0];
    if (linked) { useDestination(linked); return; }
    if (!st.verified) {                                       // identity first
      if (st.kyc === 'none' || !st.kyc) {                    // never registered → our native sheet (B178)
        const p = (st.profile && st.profile.legalName) || ''; const i = p.lastIndexOf(' ');
        const a = (st.profile && st.profile.address) || {};
        setKyc({ first: i > 0 ? p.slice(0, i) : p, last: i > 0 ? p.slice(i + 1) : '', address: a.address || '', city: a.city || '', state: a.state || '', zip: a.zip || '', ssn4: '' });
        setKycPending({ kind: m.kind }); setKycSheet(true); return;
      }
      if (st.verificationLink) { Linking.openURL(st.verificationLink).catch(() => {}); return; }   // pending → selfie in Safari
      openLink('all'); return;                               // anything else → Coinflow's page decides
    }
    if (m.kind === 'paypal') { setPaypalEmail(signedInEmail || ''); setPaypalSheet(true); return; }
    if (m.kind === 'card') { setCardReady(false); setCardSheet(true); return; }   // B183: native card sheet
    if (m.kind === 'venmo') { setVenmoPhone(''); setVenmoSheet(true); return; }   // B181: native phone sheet
    openLink(m.kind);                                        // bank → Coinflow's page (Plaid)
  }

  const kycValid = /^[A-Za-z][A-Za-z'\-.]+$/.test(kyc.first.trim()) && /^[A-Za-z][A-Za-z'\-. ]+$/.test(kyc.last.trim()) && kyc.address.trim().length >= 3 && kyc.city.trim().length >= 2 && /^[A-Za-z]{2}$/.test(kyc.state.trim()) && /^\d{5}(-\d{4})?$/.test(kyc.zip.trim()) && /^\d{4}$/.test(kyc.ssn4);
  async function submitKyc() {
    if (!kycValid || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${httpsBase}/api/kyc/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseToken, firstName: kyc.first.trim(), lastName: kyc.last.trim(), address: kyc.address.trim(), city: kyc.city.trim(), state: kyc.state.trim().toUpperCase(), zip: kyc.zip.trim(), ssn4: kyc.ssn4 }) });
      const j = await r.json().catch(() => ({}));
      setKyc((k) => ({ ...k, ssn4: '' }));                    // never keep the digits around
      if (!j.ok) { setErr(j.error === 'name_invalid' ? 'Check your name' : j.error === 'address_invalid' ? 'Check your address' : j.error === 'ssn4_invalid' ? 'Enter the last 4 digits of your SSN' : 'Verification is unavailable right now — try again shortly'); return; }
      setKycSheet(false);
      if (j.verified) { if (onToast) onToast('VERIFIED'); const k = kycPending && kycPending.kind; setKycPending(null); await load(true); if (k) setTimeout(() => { const m = METHODS.find((x) => x.kind === k); if (m) tapMethod(m); }, 50); return; }
      // instant check failed → Coinflow needs a selfie
      await load(true);
      if (j.verificationLink) { if (onToast) onToast('ONE MORE STEP — A QUICK SELFIE'); Linking.openURL(j.verificationLink).catch(() => {}); }
      else if (onToast) onToast('Verification is being reviewed');
    } catch { setErr('Network error — try again'); }
    finally { setBusy(false); }
  }

  async function submitWithdraw(freshTok) { // shared tail of both step-up paths (email code + Apple re-auth)
    if (!idemRef.current) idemRef.current = Crypto.randomUUID();
    const body = { supabaseToken: freshTok, amountCents: cents, destinationToken: dest.token, idempotencyKey: idemRef.current };
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
  async function confirmWithApple() { // B129: fresh Apple sign-in = the step-up for Apple accounts (mirrors App.js signInWithApple)
    if (inFlightRef.current) return; inFlightRef.current = true; setErr(''); setBusy(true);
    try {
      let AppleAuthentication; try { AppleAuthentication = require('expo-apple-authentication'); } catch (e) { setErr('Apple sign-in not available on this device'); return; }
      const rawNonce = `${Date.now()}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`;
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashedNonce });
      if (!cred.identityToken) { setErr('Apple could not confirm — try again'); return; }
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
      if (error || !data || !data.session) { setErr((error && error.message) || 'Apple confirmation failed — try again'); return; }
      await submitWithdraw(data.session.access_token);
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
      await submitWithdraw(data.session.access_token);
    } catch (e) { setErr((e && e.message) || 'Withdrawal failed'); }
    finally { setBusy(false); inFlightRef.current = false; }
  }
  async function cancel(id) {
    try { const r = await fetch(`${httpsBase}/api/withdraw/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseToken, withdrawalId: id }) }); const j = await r.json().catch(() => ({})); if (onToast) onToast(j.ok ? 'Cancelled — credits are back' : humanError(j.error), j.ok ? undefined : 'error'); load(true); } catch {}
  }

  const fieldStyle = { borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)', borderRadius: 16 * s, paddingVertical: 26 * s, paddingHorizontal: 32 * s, color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 34 * s, letterSpacing: 0.04 * 34 * s, backgroundColor: 'rgba(16,20,13,0.55)' };
  const labelStyle = { fontFamily: FONTS.interExtra, fontSize: 24 * s, color: COLORS.creamDim, letterSpacing: 0.1 * 24 * s, marginBottom: 14 * s, marginLeft: 6 * s };
  const card = { marginHorizontal: 45 * s, marginBottom: 28 * s, backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s, borderColor: 'rgba(215,248,74,0.35)', borderRadius: RADII.glass * s, padding: 34 * s };
  const cta = (enabled) => ({ opacity: enabled ? 1 : 0.5, marginHorizontal: 45 * s, backgroundColor: COLORS.lime, borderRadius: RADII.cta * s, paddingVertical: 44 * s, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 18 * s });
  const ctaText = { fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C', letterSpacing: 0.03 * 60 * s, includeFontPadding: false };
  const row = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginHorizontal: 45 * s, paddingVertical: 18 * s, borderBottomWidth: 1, borderBottomColor: 'rgba(245,241,230,0.14)', borderStyle: 'dashed' };
  const rowK = { fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.creamDim, letterSpacing: 0.02 * 28 * s };
  const rowV = (c) => ({ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: c || COLORS.cream });
  const back = (to) => (<Pressable onPress={() => { setPhase(to); setErr(''); }} hitSlop={16} style={{ marginHorizontal: 45 * s, marginBottom: 20 * s }}><Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: COLORS.lime, letterSpacing: 0.06 * 28 * s }}>‹ BACK</Text></Pressable>);

  // ───────────────────────────── amount / code ─────────────────────────────
  if ((phase === 'amount' || phase === 'code') && dest) {
    const m = METHODS.find((x) => x.kind === dest.kind) || { title: dest.kind };
    const ident = dest.alias ? dest.alias : dest.last4 ? '••' + dest.last4 : '';
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        {back('list')}
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 26 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.04 * 26 * s, marginBottom: 20 * s }}>TO {m.title.toUpperCase()}{ident ? ' · ' + ident : ''}</Text>
        <AmountKeypad value={amount} onChange={(v) => { setAmount(v); idemRef.current = null; }} maxCents={withdrawable} disabled={phase === 'code'} tone={COLORS.lime}
          hint={`WITHDRAWABLE ${dollars(withdrawable)} · MIN ${dollars(minCents)}`}
          chips={[{ label: 'MAX', cents: withdrawable }, ...[2500, 5000, 10000].filter((c) => c <= withdrawable && c >= minCents).map((c) => ({ label: dollars(c), cents: c }))]} />
        {amount && !amountOk ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, textAlign: 'center', marginHorizontal: 51 * s, marginTop: 16 * s }}>{cents < minCents ? 'Minimum ' + dollars(minCents) : 'Up to ' + dollars(withdrawable) + ' is withdrawable right now'}</Text> : null}
        {quote ? (
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.cream, textAlign: 'center', marginHorizontal: 45 * s, marginTop: 20 * s, marginBottom: 26 * s }}>
            {quote.feeCents ? `FEE ${dollars(quote.feeCents)} · ` : 'NO FEE · '}YOU RECEIVE <Text style={{ color: COLORS.lime }}>{dollars(quote.receiveCents != null ? quote.receiveCents : quote.netCents != null ? quote.netCents : cents)}</Text> · {speedLabel(quote.speed)}</Text>
        ) : <View style={{ height: 26 * s }} />}

        {phase === 'code' ? (
          <View style={card}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 28 * s, color: COLORS.lime, letterSpacing: 0.06 * 28 * s, marginBottom: 12 * s }}>CONFIRM WITH THE CODE WE EMAILED</Text>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 22 * s }}>{signedInEmail}</Text>
            <TextInput placeholder="6-digit code" placeholderTextColor={COLORS.creamDim} value={code} onChangeText={(t) => setCode(digits(t).slice(0, 8))} keyboardType="number-pad" maxLength={8} autoFocus style={fieldStyle} />
            <Pressable onPress={sendCode} disabled={busy} hitSlop={12}><Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim, marginTop: 18 * s, textAlign: 'center' }}>RESEND CODE</Text></Pressable>
          </View>
        ) : null}
        {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: RED, textAlign: 'center', marginHorizontal: 45 * s, marginBottom: 22 * s }}>{err}</Text>) : null}
        {phase === 'amount' ? (
          <PressBtn onPress={sendCode} disabled={!ready} style={cta(ready)}>{busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>{amountOk ? 'WITHDRAW ' + dollars(cents) : 'WITHDRAW'}</Text></PressBtn>
        ) : (
          <PressBtn onPress={confirm} disabled={busy || code.trim().length < 6} style={cta(!busy && code.trim().length >= 6)}>{busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>{busy ? 'SENDING…' : 'CONFIRM ' + dollars(cents)}</Text></PressBtn>
        )}
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 22 * s, color: COLORS.creamDim, textAlign: 'center', letterSpacing: 0.04 * 22 * s, marginTop: 26 * s, marginHorizontal: 45 * s }}>
          {dollars((st.limits && st.limits.dayCents) || 100000)} PER DAY · FIRST WITHDRAWAL AND ANYTHING OVER {dollars((st.limits && st.limits.approvalCents) || 50000)} IS REVIEWED WITHIN 24H</Text>
      </ScrollView>
    );
  }

  // ───────────────────────────── done ─────────────────────────────
  if (phase === 'done' && result) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }}>
        <View style={{ height: 60 * s }} />
        <View style={card}>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 64 * s, color: COLORS.lime, textAlign: 'center', includeFontPadding: false, marginBottom: 14 * s }}>{result.needsApproval ? 'SENT FOR REVIEW' : 'ON ITS WAY'}</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 26 * s, color: COLORS.creamDim, textAlign: 'center', lineHeight: 38 * s }}>
            {result.needsApproval ? `${dollars(result.amountCents)} is reserved. We review first withdrawals, new payout accounts and anything over $500 within 24 hours — you'll get a notification.`
              : `${dollars(result.receiveCents != null ? result.receiveCents : result.netCents != null ? result.netCents : result.amountCents)} is on its way to your ${dest ? kindLabel(dest.kind) : 'account'} (${speedLabel(result.speed).toLowerCase()}).`}</Text>
          <PressBtn onPress={() => { setPhase('list'); setAmount(''); setResult(null); setDest(null); if (onDone) onDone(); }} style={{ marginTop: 26 * s, backgroundColor: COLORS.lime, borderRadius: 20 * s, paddingVertical: 30 * s, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: '#10140C', letterSpacing: 0.06 * 36 * s }}>DONE</Text></PressBtn>
        </View>
      </ScrollView>
    );
  }

  // ───────────────────────────── list ─────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 * s }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontFamily: FONTS.anton, fontSize: 150 * s, color: COLORS.wordmark, textAlign: 'center', includeFontPadding: false, marginBottom: 20 * s }}>WITHDRAW</Text>

      <View style={row}><Text style={rowK}>Withdrawable cash</Text><Text style={rowV(COLORS.lime)}>{st ? dollars(st.withdrawableCents) : '—'}</Text></View>
      <View style={row}><Text style={rowK}>Balance</Text><Text style={rowV()}>{balance}</Text></View>
      {st && st.owedCents > 0 ? <View style={row}><Text style={rowK}>Play through to unlock</Text><Text style={rowV()}>{dollars(st.owedCents)}</Text></View> : null}
      <View style={[row, { borderBottomWidth: 0, marginBottom: 30 * s }]}><Text style={rowK}>Daily limit</Text><Text style={rowV()}>{st && st.limits ? dollars(st.limits.dayCents) : '—'}</Text></View>

      {!st && !loadErr ? <ActivityIndicator color={COLORS.lime} style={{ marginTop: 40 * s }} /> : null}
      {loadErr ? (<Pressable onPress={() => load(true)}><Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: RED, textAlign: 'center', marginHorizontal: 45 * s }}>{loadErr} · TAP TO RETRY</Text></Pressable>) : null}
      {st && !st.enabled ? (<View style={card}><Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, color: COLORS.cream, textAlign: 'center' }}>Withdrawals are coming soon.</Text></View>) : null}

      {st && st.enabled ? (<>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 44 * s, color: COLORS.cream, textAlign: 'center', marginBottom: 10 * s }}>Choose a transfer method</Text>
        <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, textAlign: 'center', marginHorizontal: 60 * s, marginBottom: 30 * s, lineHeight: 34 * s }}>
          Minimum {dollars(minCents)}. Cash must be played through once to be withdrawn. Winnings are always withdrawable.</Text>
        {!st.verified ? (
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.lime, textAlign: 'center', marginHorizontal: 60 * s, marginBottom: 20 * s, letterSpacing: 0.04 * 24 * s }}>
            {(st.kyc === 'pending' || st.kyc === 'partial-approval') && st.verificationLink ? 'ONE MORE STEP — A QUICK SELFIE TO CONFIRM IT\'S YOU' : st.kyc === 'pending' || st.kyc === 'partial-approval' ? 'YOUR VERIFICATION IS BEING REVIEWED' : st.kyc === 'rejected' ? 'VERIFICATION COULD NOT BE COMPLETED — CONTACT SUPPORT' : 'ONE-TIME IDENTITY VERIFICATION FIRST · HANDLED BY COINFLOW, SENSE NEVER SEES YOUR ID'}</Text>
        ) : null}
        {/* B178: the instant database check failed and Coinflow (Persona) needs a selfie. That step needs
            the camera, which this app's WebView is not entitled to on builds <= 25, so it opens in Safari.
            The link comes from /api/withdraw/status (Coinflow's 451 verificationLink). */}
        {!st.verified && st.verificationLink ? (
          <PressBtn onPress={() => { Linking.openURL(st.verificationLink).catch(() => {}); }} style={{ marginHorizontal: 45 * s, marginBottom: 24 * s, borderRadius: 32 * s, paddingVertical: 30 * s, alignItems: 'center', backgroundColor: COLORS.lime }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: '#10140D', letterSpacing: 0.04 * 32 * s }}>FINISH VERIFICATION</Text>
          </PressBtn>
        ) : null}
        {/* every method, always — a linked one carries its account, an unlinked one collects it on tap */}
        {METHODS.map((m) => { const d = linkedFor(m.kind)[0];
          const acct = d ? (d.alias || (d.last4 ? '••' + d.last4 : null)) : null;
          return (
            <PressBtn key={m.kind} onPress={() => tapMethod(m)} style={{ marginHorizontal: 45 * s, marginBottom: 20 * s, flexDirection: 'row', alignItems: 'center',
              backgroundColor: 'rgba(245,241,230,0.06)', borderRadius: 32 * s, paddingVertical: 28 * s, paddingHorizontal: 30 * s,
              borderWidth: 1.5 * s, borderColor: d ? 'rgba(215,248,74,0.35)' : 'transparent' }}>
              <View style={{ width: 88 * s, alignItems: 'center', marginRight: 24 * s }}><PayLogo id={m.kind} size={88 * s} variant="badge" /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 34 * s, color: COLORS.cream }}>{m.title}</Text>
                <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginTop: 6 * s }} numberOfLines={2}>
                  {m.fee}{acct ? ' · ' + acct : ''}</Text>
              </View>
              {d ? (
                <Pressable onPress={() => changeMethod(m)} hitSlop={14} style={{ marginLeft: 16 * s, paddingVertical: 10 * s, paddingHorizontal: 18 * s, borderRadius: 18 * s, backgroundColor: 'rgba(245,241,230,0.10)' }}>
                  <Text style={{ fontFamily: FONTS.interBold, fontSize: 20 * s, color: COLORS.cream, letterSpacing: 0.06 * 20 * s }}>CHANGE</Text>
                </Pressable>
              ) : (<Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginLeft: 16 * s }}>{m.speed}</Text>)}
            </PressBtn>); })}
        {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: RED, textAlign: 'center', marginHorizontal: 45 * s, marginTop: 16 * s }}>{err}</Text>) : null}
      </>) : null}

      {st && st.recent && st.recent.length ? (
        <View style={{ marginTop: 40 * s }}>
          <Text style={[labelStyle, { marginHorizontal: 45 * s }]}>RECENT WITHDRAWALS</Text>
          {st.recent.map((w) => (
            <View key={w.withdrawalId} style={{ marginHorizontal: 45 * s, marginBottom: 14 * s, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.18)', borderRadius: 20 * s, paddingVertical: 22 * s, paddingHorizontal: 28 * s }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.cream }}>{dollars(w.amountCents)} <Text style={{ color: COLORS.creamDim, fontFamily: FONTS.interSemi, fontSize: 24 * s }}>→ {kindLabel(w.destination && w.destination.kind)}{w.destination && w.destination.last4 ? ' ••' + w.destination.last4 : ''}</Text></Text>
                <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, color: w.status === 'paid' ? COLORS.lime : (w.status === 'failed' || w.status === 'rejected') ? RED : COLORS.creamDim, letterSpacing: 0.06 * 22 * s, marginTop: 6 * s }}>{statusLabel(w)} · {new Date(w.createdAt).toLocaleDateString()}</Text>
              </View>
              {w.status === 'requested' ? (<Pressable onPress={() => cancel(w.withdrawalId)} hitSlop={12}><Text style={{ fontFamily: FONTS.interExtra, fontSize: 24 * s, color: RED, letterSpacing: 0.06 * 24 * s }}>CANCEL</Text></Pressable>) : null}
            </View>))}
        </View>
      ) : null}

      {/* B178: native identity sheet — one time, before the first withdrawal */}
      <Modal visible={kycSheet} animationType="slide" transparent onRequestClose={() => setKycSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => { Keyboard.dismiss(); }}>
          <Pressable style={{ backgroundColor: '#10140D', borderTopLeftRadius: 40 * s, borderTopRightRadius: 40 * s, padding: 45 * s, paddingBottom: 60 * s }} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 1100 * s }}>
              <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.lime, letterSpacing: 0.06 * 30 * s, marginBottom: 12 * s }}>VERIFY YOUR IDENTITY</Text>
              <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 22 * s, lineHeight: 34 * s }}>One time, required by law before your first withdrawal. Checked instantly by Coinflow, our licensed payments partner. Sense never stores your SSN.</Text>
              {[['first', 'First name', 'givenName', 'words', 'default'], ['last', 'Last name', 'familyName', 'words', 'default'], ['address', 'Street address', 'fullStreetAddress', 'words', 'default'], ['city', 'City', 'addressCity', 'words', 'default']].map(([k, ph, tct, cap, kb]) => (
                <TextInput key={k} placeholder={ph} placeholderTextColor={COLORS.creamDim} value={kyc[k]} onChangeText={(t) => setKyc((x) => ({ ...x, [k]: t.slice(0, 120) }))} autoCapitalize={cap} autoCorrect={false} textContentType={tct} keyboardType={kb}
                  style={{ fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.cream, backgroundColor: 'rgba(245,241,230,0.08)', borderRadius: 22 * s, paddingVertical: 24 * s, paddingHorizontal: 28 * s, marginBottom: 16 * s }} />))}
              <View style={{ flexDirection: 'row', gap: 16 * s }}>
                <TextInput placeholder="State" placeholderTextColor={COLORS.creamDim} value={kyc.state} onChangeText={(t) => setKyc((x) => ({ ...x, state: t.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() }))} autoCapitalize="characters" autoCorrect={false} textContentType="addressState" maxLength={2}
                  style={{ flex: 1, fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.cream, backgroundColor: 'rgba(245,241,230,0.08)', borderRadius: 22 * s, paddingVertical: 24 * s, paddingHorizontal: 28 * s, marginBottom: 16 * s }} />
                <TextInput placeholder="ZIP" placeholderTextColor={COLORS.creamDim} value={kyc.zip} onChangeText={(t) => setKyc((x) => ({ ...x, zip: t.replace(/[^0-9-]/g, '').slice(0, 10) }))} keyboardType="number-pad" textContentType="postalCode" maxLength={10}
                  style={{ flex: 1.4, fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.cream, backgroundColor: 'rgba(245,241,230,0.08)', borderRadius: 22 * s, paddingVertical: 24 * s, paddingHorizontal: 28 * s, marginBottom: 16 * s }} />
                <TextInput placeholder="SSN last 4" placeholderTextColor={COLORS.creamDim} value={kyc.ssn4} onChangeText={(t) => setKyc((x) => ({ ...x, ssn4: t.replace(/\D/g, '').slice(0, 4) }))} keyboardType="number-pad" secureTextEntry maxLength={4}
                  style={{ flex: 1.4, fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.cream, backgroundColor: 'rgba(245,241,230,0.08)', borderRadius: 22 * s, paddingVertical: 24 * s, paddingHorizontal: 28 * s, marginBottom: 16 * s }} />
              </View>
              {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, marginTop: 8 * s }}>{err}</Text>) : null}
              <PressBtn onPress={submitKyc} disabled={busy || !kycValid} style={[cta(!busy && kycValid), { marginHorizontal: 0, marginTop: 22 * s }]}>
                {busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>VERIFY</Text></PressBtn>
              <Pressable onPress={() => { setKycSheet(false); setKycPending(null); }} style={{ alignItems: 'center', marginTop: 22 * s }}><Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim }}>Not now</Text></Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* B183: Debit card — Coinflow's secure card field inside our sheet; token → /api/withdraw/link/card */}
      <Modal visible={cardSheet} animationType="slide" transparent onRequestClose={() => setCardSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => { Keyboard.dismiss(); setCardSheet(false); }}>
          <Pressable style={{ backgroundColor: '#10140D', borderTopLeftRadius: 40 * s, borderTopRightRadius: 40 * s, padding: 45 * s, paddingBottom: 70 * s }} onPress={() => {}}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.lime, letterSpacing: 0.06 * 30 * s, marginBottom: 12 * s }}>DEBIT CARD</Text>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 18 * s, lineHeight: 34 * s }}>Visa or Mastercard debit. Instant payouts. Card details go straight to Coinflow — Sense never sees the number.</Text>
            <View style={{ height: cardH, borderRadius: 22 * s, overflow: 'hidden', backgroundColor: '#10140D' }}>
              {cardSheet ? (
                <WebView ref={cardWv} onMessage={onCardMsg} originWhitelist={['https://*']} javaScriptEnabled domStorageEnabled
                  source={{ uri: `${((st && st.env) || 'sandbox') === 'prod' ? 'https://coinflow.cash' : `https://${(st && st.env) || 'sandbox'}.coinflow.cash`}/form/v2/card-form?merchantId=${encodeURIComponent((st && st.merchantId) || 'sensegame')}&useHeightChange=true` }}
                  style={{ flex: 1, backgroundColor: 'transparent' }} scrollEnabled={false} />
              ) : null}
              {!cardReady ? <ActivityIndicator color={COLORS.lime} style={{ position: 'absolute', top: 40 * s, alignSelf: 'center' }} /> : null}
            </View>
            {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, marginTop: 16 * s }}>{err}</Text>) : null}
            <PressBtn onPress={linkCard} disabled={busy || !cardReady} style={[cta(!busy && cardReady), { marginHorizontal: 0, marginTop: 22 * s }]}>
              {busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>LINK CARD</Text></PressBtn>
          </Pressable>
        </Pressable>
      </Modal>

      {/* B181: Venmo — link or change by phone (Coinflow's add-Venmo API) */}
      <Modal visible={venmoSheet} animationType="slide" transparent onRequestClose={() => setVenmoSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => { Keyboard.dismiss(); setVenmoSheet(false); }}>
          <Pressable style={{ backgroundColor: '#10140D', borderTopLeftRadius: 40 * s, borderTopRightRadius: 40 * s, padding: 45 * s, paddingBottom: 80 * s }} onPress={() => {}}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.lime, letterSpacing: 0.06 * 30 * s, marginBottom: 12 * s }}>VENMO ACCOUNT</Text>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 22 * s, lineHeight: 34 * s }}>The phone number on your Venmo. This replaces the Venmo currently linked; a new account goes through review on its first payout.</Text>
            <TextInput placeholder="(415) 555-1234" placeholderTextColor={COLORS.creamDim} value={venmoPhone} onChangeText={(t) => setVenmoPhone(t.replace(/[^0-9()\-\s]/g, '').slice(0, 16))} keyboardType="phone-pad" textContentType="telephoneNumber" autoCorrect={false}
              style={{ fontFamily: FONTS.interSemi, fontSize: 30 * s, color: COLORS.cream, backgroundColor: 'rgba(245,241,230,0.08)', borderRadius: 22 * s, paddingVertical: 26 * s, paddingHorizontal: 28 * s }} />
            {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, marginTop: 16 * s }}>{err}</Text>) : null}
            <PressBtn onPress={linkVenmo} disabled={busy || venmoPhone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1').length !== 10} style={[cta(!busy && venmoPhone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1').length === 10), { marginHorizontal: 0, marginTop: 26 * s }]}>
              {busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>SAVE VENMO</Text></PressBtn>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PayPal: native email sheet (Coinflow's add-PayPal API — no WebView) */}
      <Modal visible={paypalSheet} animationType="slide" transparent onRequestClose={() => setPaypalSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => { Keyboard.dismiss(); setPaypalSheet(false); }}>
          <Pressable style={{ backgroundColor: '#10140D', borderTopLeftRadius: 40 * s, borderTopRightRadius: 40 * s, padding: 45 * s, paddingBottom: 80 * s }} onPress={() => {}}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, color: COLORS.lime, letterSpacing: 0.06 * 30 * s, marginBottom: 12 * s }}>LINK PAYPAL</Text>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, color: COLORS.creamDim, marginBottom: 22 * s, lineHeight: 34 * s }}>The email on your PayPal account. Payouts land there instantly.</Text>
            <TextInput placeholder="you@example.com" placeholderTextColor={COLORS.creamDim} value={paypalEmail} onChangeText={setPaypalEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoFocus style={fieldStyle} onSubmitEditing={linkPaypal} returnKeyType="done" />
            {err ? (<Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: RED, marginTop: 16 * s }}>{err}</Text>) : null}
            <PressBtn onPress={linkPaypal} disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail.trim())} style={[cta(!busy && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail.trim())), { marginHorizontal: 0, marginTop: 26 * s }]}>
              {busy ? <ActivityIndicator color="#10140C" /> : null}<Text style={ctaText}>LINK PAYPAL</Text></PressBtn>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Coinflow hosted KYC + Venmo / card / bank linking */}
      <Modal visible={!!linkUrl} animationType="slide" onRequestClose={() => linkDone()}>
        <View style={{ flex: 1, backgroundColor: '#10140D', paddingTop: Platform.OS === 'ios' ? 54 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 16, color: COLORS.cream, letterSpacing: 1 }}>SECURED BY COINFLOW</Text>
            <Pressable onPress={() => linkDone()} hitSlop={16}><Text style={{ fontFamily: FONTS.interExtra, fontSize: 16, color: COLORS.lime, letterSpacing: 1 }}>CLOSE</Text></Pressable>
          </View>
          {linkUrl ? (
            <WebView source={{ uri: linkUrl }} style={{ flex: 1, backgroundColor: '#fff' }} originWhitelist={['https://*']} javaScriptEnabled domStorageEnabled sharedCookiesEnabled mediaCapturePermissionGrantType="grant" allowsInlineMediaPlayback
              injectedJavaScript={HIDE_POWERED_BY}
              onMessage={(e) => { try { const m = JSON.parse(e.nativeEvent.data); if (m && m.method === 'accountLinked') linkDone('Linked — you can withdraw now'); } catch {} }}
              onShouldStartLoadWithRequest={(req) => { if (String(req.url || '').startsWith(LINK_RETURN)) { linkDone('Linked — you can withdraw now'); return false; } return true; }}
              onError={() => { linkDone(); setErr('Could not open verification — try again'); }} />
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}
