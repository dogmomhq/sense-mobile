// ── COINFLOW CHECKOUT COMPONENTS (B131; B133 adds the standalone Apple Pay button) ─────────────
// Faithful, minimal ports of `CoinflowPurchase`, `CoinflowWebView` and `CoinflowApplePayButton`
// from @coinflowlabs/react-native@4.21.0 (Apache-2.0, coinflow-labs-us) — same routes, same query
// encoding, same page→native message protocol. We port instead of installing because the package
// hard-imports @solana/web3.js + bs58 + @nsure-ai at module load.
//
// Two surfaces, two hosts (this difference is in their SDK and matters):
//   CoinflowPurchase       → app.coinflow.cash  /<chain>/purchase-v2/<MID>   full checkout sheet
//   CoinflowApplePayButton → coinflow.cash      /form/<chain>/apple-pay/<MID>  JUST the Apple Pay button
//
// Apple Pay: react-native-webview's `enableApplePay` (iOS) lets the hosted page run Apple Pay on
// the Web under COINFLOW's merchant id — no entitlement, no Merchant ID, nothing in App Store
// Connect. Cost of that flag: iOS disables JS injection in that WebView, so nothing can be posted
// INTO the page. Their SDK works around it with a hidden same-origin bridge WebView that relays
// subtotal changes; we don't need it because the amount is fixed when the intent is created — a
// new amount is a new intent, and remounting on `key` gives the page a fresh subtotal.
// Apple Pay cannot be tapped in the simulator; real device only.
//
// PayPal / Venmo: the page asks us to open an external URL ({method:'rnredirect'}). We open it with
// Linking; the user pays in the PayPal app / browser and comes back. The hosted page keeps polling
// Coinflow and posts {method:'success'} — but the PHONE NEVER DECIDES THAT MONEY ARRIVED: the caller
// polls /api/deposit/status until the server says `settled` (signed Settled webhook).
//
// Protocol (page → native), from common/CoinflowLibMessageHandlers.js:
//   loaded · success{info} · authDeclined{info} · inputError{info} · inputValid · heightChange:<id>
//   rnredirect{info:{callbackUrl, flow?:'venmo'}} · accountLinked · overlay · redirect(data=url)
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, ActivityIndicator, Linking, Platform, Image, StyleSheet } from 'react-native';
import PayLogo, { BRAND } from './components/PayLogo';
import { FONTS } from './theme';
import { WebView } from 'react-native-webview';
import LZString from 'lz-string';

// SDK: CoinflowUtils.getCoinflowAppBaseUrl (checkout app) / getCoinflowBaseUrl (form pages).
const baseUrl = (env, which) => {
  const prod = which === 'app' ? 'https://app.coinflow.cash' : 'https://coinflow.cash';
  if (!env || env === 'prod') return prod;
  return which === 'app' ? `https://app-${env}.coinflow.cash` : `https://${env}.coinflow.cash`;
};

// SDK: CoinflowUtils.getCoinflowUrl, restricted to the params a fiat session-key merchant uses.
// `blockchain` defaults to 'solana' in their SDK even for fiat-only merchants — it only selects
// Coinflow's own settlement rail, which is theirs, not ours.
export function coinflowUrl({ which = 'app', routePrefix, route, env, merchantId, sessionKey, cents, lockAmount = true, webhookInfo, email,
  allowedPaymentMethods, chargebackProtectionData, chargebackProtectionAccountType, deviceId, theme, supportEmail, handleHeightChangeId }) {
  const prefix = routePrefix ? `/${routePrefix}/solana` : '/solana';
  const u = new URL(prefix + route.replace('<MID>', encodeURIComponent(merchantId)), baseUrl(env, which));
  const q = u.searchParams;
  if (sessionKey) q.append('sessionKey', sessionKey);
  if (Number.isInteger(cents)) { q.append('cents', String(cents)); q.append('currency', 'USD'); }
  if (webhookInfo) q.append('webhookInfo', LZString.compressToEncodedURIComponent(JSON.stringify(webhookInfo)));
  if (theme) q.append('theme', LZString.compressToEncodedURIComponent(JSON.stringify(theme)));
  if (email) q.append('email', email);
  if (supportEmail) q.append('supportEmail', supportEmail);
  if (chargebackProtectionData) q.append('chargebackProtectionData', LZString.compressToEncodedURIComponent(JSON.stringify(chargebackProtectionData)));
  if (chargebackProtectionAccountType) q.append('chargebackProtectionAccountType', chargebackProtectionAccountType);
  if (deviceId) q.append('deviceId', deviceId);
  if (handleHeightChangeId) q.append('useHeightChange', String(handleHeightChangeId));
  if (lockAmount) q.append('lockAmount', 'true');
  if (allowedPaymentMethods && allowedPaymentMethods.length) q.append('allowedPaymentMethods', allowedPaymentMethods.join(','));
  return u.toString();
}

// Shared page→native handling for both components.
function makeMessageHandler({ onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect, onError, setLoading }) {
  return (ev) => {
    const raw = ev && ev.nativeEvent && ev.nativeEvent.data;
    if (typeof raw !== 'string') return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || !m.method) return;
    const method = String(m.method);
    if (method === 'rnredirect' && m.info && m.info.callbackUrl) {   // SDK: RN_REDIRECT_MESSAGE_NAME — PayPal / Venmo hand-off
      const cb = String(m.info.callbackUrl);
      const target = m.info.flow === 'venmo' ? `${cb}&presentation=popup&display=browser` : cb; // SDK: openVenmoAppFlow
      if (onExternalRedirect) onExternalRedirect(m.info.flow || 'browser');
      Linking.openURL(target).catch(() => {}); // SDK swallows this too: the page's own polling surfaces a timeout
      return;
    }
    if (method === 'loaded') { if (setLoading) setLoading(false); if (onLoad) onLoad(); return; }
    if (method === 'success') { if (onSuccess) onSuccess(m.info || null); return; }
    if (method === 'authDeclined') { if (onAuthDeclined) onAuthDeclined(m.info || null); return; }
    if (method === 'inputError') { if (onInputError) onInputError(m.info || null); return; }
    if (method === 'redirect' && m.data) { Linking.openURL(String(m.data)).catch(() => {}); return; }
    if (typeof m.data === 'string' && m.data.startsWith('ERROR') && onError) { onError(m.info || m.data); return; }
    // inputValid · heightChange:<id> · accountLinked · overlay · updateSubtotal: nothing to do
  };
}

// ── standalone brand pay buttons (SDK: CoinflowApplePayButton / PayPal / Venmo) ────────────────
// Coinflow ships NO PayPal/Venmo/Cash App logo files, and that is deliberate: each brand's button
// is drawn by that brand's own SDK on Coinflow's hosted form page (/form/<chain>/<method>/<MID>),
// which is exactly what PayPal's and Venmo's brand rules require. So the official mark is always
// live and always current — we just give the page a box to render in.
// Apple Pay is the exception: Apple's button must be drawn natively, so their mark IS shipped as a
// PNG and is overlaid above the WebView with pointerEvents="none" — the button looks right
// instantly and touches fall through to the real hosted button underneath.
const APPLE_MARK = { white: require('../assets/pay/ApplePayWhite.png'), black: require('../assets/pay/ApplePayBlack.png') };
const FORM_ROUTE = { applePay: '/apple-pay/<MID>', paypal: '/paypal/<MID>', venmo: '/venmo/<MID>' };
const IDENTIFIER_MSG = { paypal: 'paypalIdentifier', venmo: 'venmoIdentifier' };
export const STANDALONE_METHODS = Object.keys(FORM_ROUTE);

// `onOverlay(open)` fires when PayPal/Venmo open their in-page approval modal: the parent must give
// this button the whole sheet while it is open, or the modal renders inside a 56pt strip.
// `inert` draws the button's chrome with no WebView under it. The parent uses it while the deposit
// intent is still being created — there is no session key to point a real button at yet — so the
// live button drops into an identical box instead of replacing a differently-shaped one.
// `hidden` keeps the WebView mounted and loading but takes it out of the layout and out of reach of
// touches (B160). The parent mounts every brand button once and swaps which one is visible, so
// changing payment method is instant instead of tearing down a WebView and loading a page again.
export function CoinflowMethodButton({ method = 'applePay', color = 'white', height = 56, radius = 28, expanded = false,
  inert = false, inertColor, hidden = false, label, onApprove, onError, onLoad, onOverlay, onEvent, style, email, ...props }) {
  const ref = useRef(null);
  const ev = useCallback((name) => { try { onEvent && onEvent(name); } catch {} }, [onEvent]);
  useEffect(() => { ev('mount'); return () => ev('unmount'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const isApple = method === 'applePay';
  // B161: MEASURED, not guessed. Coinflow's form page carries a `#height-ref` element and that is
  // exactly what its `useHeightChange` reports; loading /form/solana/paypal/… at phone width it is
  // 49 CSS px (their button is Tailwind `h-12`, plus a pixel), and CSS px are points in a WebView.
  // Our pill was a different height, so their button sat inside a taller/shorter rounded mask and the
  // mask's curve ate its bottom corners — that is the "cut off at the bottom" button. The box is now
  // that height, and grows only if the page says it needs more.
  const FORM_H = 49;
  const [contentH, setContentH] = useState(0);
  const heightId = useMemo(() => (isApple ? null : 'h' + Math.random().toString(36).slice(2, 8)), [isApple]);
  const boxH = height;   // B169: every pill is the same height; the page's 49px button sits centred underneath (see webStrip)
  // B146: `ready` = Coinflow's page has told us its button is up. Until then a tap lands on a WebView
  // that is still loading and does nothing — which read as "the button is broken". The pill is drawn
  // ONCE, white, and never changes colour or size; only a small spinner at the right edge says
  // "not yet", and it disappears the moment the real button underneath can take the tap.
  const [ready, setReady] = useState(false);
  // The identifier is deliberately kept OUT of the url (SDK does the same) and posted in after load,
  // so changing it never reloads the page.
  // NOTE: the url must NOT change when the parent re-renders, or the WebView reloads and the button
  // goes dead for a second. `props` is spread by the caller, so depend on the fields, not the object.
  const { env, merchantId, sessionKey, cents, webhookInfo, theme, deviceId, chargebackProtectionData, chargebackProtectionAccountType } = props;
  const url = useMemo(() => !sessionKey ? null : coinflowUrl({ env, merchantId, sessionKey, cents, webhookInfo, theme, deviceId,
    chargebackProtectionData, chargebackProtectionAccountType, email: isApple ? email : undefined,
    which: 'form', routePrefix: 'form', route: FORM_ROUTE[method] || FORM_ROUTE.applePay, handleHeightChangeId: heightId || undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [env, merchantId, sessionKey, cents, method, isApple, email, heightId, JSON.stringify(webhookInfo || null)]);
  // B164: ONE instance for the life of the sheet. It is born inert (no intent yet), goes live in place
  // when the url arrives, and a new amount is a new url loaded into the SAME WebView. Nothing remounts,
  // so the pill can never blink. `ready` follows the url.
  useEffect(() => { setReady(false); if (url) ev('url'); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  // B162 — THE VENMO BUG. react-native-webview's `postMessage` delivers as
  //   window.dispatchEvent(new MessageEvent('message', {data}))
  // which has NO origin. Coinflow's form page drops every message whose origin is empty (verified
  // against sandbox.coinflow.cash: that exact event leaves the Venmo button at opacity-50 /
  // pointer-events-none; a real `window.postMessage(msg, '*')`, which carries the page's own origin,
  // enables it). PayPal's page is not gated on the identifier, which is why only Venmo looked dead.
  // So the identifier is delivered by injecting a real postMessage into the page instead.
  const post = useCallback((msg) => {
    try { ref.current && ref.current.injectJavaScript(`window.postMessage(${JSON.stringify(msg)}, '*'); true;`); } catch {}
  }, []);
  const identifier = useCallback(() => {
    if (isApple || !IDENTIFIER_MSG[method]) return;
    post(JSON.stringify({ method: IDENTIFIER_MSG[method], email: email || undefined }));
  }, [isApple, method, email, post]);
  const handleLoad = useCallback(() => {
    ev('loadedMsg');
    // iOS disables JS injection in a WebView with enableApplePay — fine, that page takes everything
    // from the url. For PayPal/Venmo the identifier goes in now and again shortly after, so a page
    // that registers its listener a tick after it says `loaded` still gets it.
    identifier();
    setTimeout(identifier, 400); setTimeout(identifier, 1500);
    setReady(true);
    if (onLoad) onLoad();
  }, [identifier, onLoad, ev]);
  useEffect(() => { if (ready) identifier(); }, [email]); // live email change, like the SDK // eslint-disable-line react-hooks/exhaustive-deps
  const onMessage = useCallback((ev) => {
    const raw = ev && ev.nativeEvent && ev.nativeEvent.data;
    if (typeof raw === 'string') {
      try {
        const m = JSON.parse(raw);
        if (m && m.method === 'overlay' && onOverlay) onOverlay(m.data === 'open');
        if (m && typeof m.method === 'string' && m.method.startsWith('heightChange')) {
          const h = Number(m.data != null ? m.data : (m.info && m.info.height));
          // CSS px ≈ pt here (the page is not zoomed); ignore nonsense so a bad message can't collapse the pill
          if (Number.isFinite(h) && h > 20 && h < 2000) setContentH(Math.ceil(h));
        }
      } catch {}
    }
    makeMessageHandler({ onLoad: handleLoad, onSuccess: onApprove, onError })(ev);
  }, [handleLoad, onApprove, onError, onOverlay]);
  // No width here: the view stretches to its parent, so the caller's horizontal margin is respected.
  // Setting width:'100%' AND a margin made the button wider than the screen.
  // B156: the box CLIPS to the pill. Coinflow's page paints a white, square-cornered body for a frame or
  // two before its button is styled, and the corners showed outside our pill as a white square. For Apple
  // Pay the WebView is also painted invisible — our chrome is the only visual; the WebView stays fully
  // tappable underneath (opacity does not block touches).
  // `hidden` parks the view off-layout at full size so its page still loads and lays out; it cannot be
  // touched and it occupies no space, so the visible button's position is unaffected.
  // B161: the rounded mask exists ONLY to hide the white square-cornered body Coinflow's page paints
  // for a frame or two before its button is styled. Once the page says it is up, the mask comes off —
  // so a brand's own button can never have its corners clipped by ours. Apple Pay keeps the mask: our
  // native chrome is painted over that WebView and IS the visual.
  // B169: EVERY brand button is drawn by us, natively — the treatment that made Apple Pay solid.
  // Coinflow's page is an invisible tap target underneath; it becomes visible only when PayPal's
  // in-page approval modal opens (`expanded`). Their page can blink, re-render or go blank after a
  // cancelled popup and the player never sees it.
  const box = [expanded ? { flex: 1 } : { height: boxH },
    { position: 'relative', borderRadius: expanded ? 0 : radius, overflow: 'hidden', backgroundColor: expanded ? '#0B0E09' : 'transparent' }, style,
    hidden ? { position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0, zIndex: -1 } : null];
  const live = !inert && !!url;
  const waiting = !live || !ready;
  const brand = BRAND[method] || BRAND.crypto;
  const chrome = expanded ? null : (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { zIndex: 20, borderRadius: radius, flexDirection: 'row', gap: height * 0.11,
      backgroundColor: isApple ? (color === 'white' ? '#FFFFFF' : '#000000') : brand.bg, alignItems: 'center', justifyContent: 'center' }]}>
      {isApple
        ? <Image source={color === 'white' ? APPLE_MARK.black : APPLE_MARK.white} style={{ height: height * 0.42, aspectRatio: 2.43, resizeMode: 'contain' }} />
        : <>
            <PayLogo id={method} size={height * 0.5} on={brand.bg === '#FFFFFF' ? 'light' : 'dark'} />
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: height * 0.24, color: brand.fg, letterSpacing: height * 0.01 }}>{label || (method === 'paypal' ? 'PAY WITH PAYPAL' : 'PAY WITH VENMO')}</Text>
          </>}
      {waiting ? <ActivityIndicator size="small" color={isApple ? (color === 'white' ? '#000000' : '#FFFFFF') : brand.fg} style={{ position: 'absolute', right: height * 0.3 }} /> : null}
    </View>);
  // The page's own button is 49 CSS px (measured, B161). When collapsed, the WebView is a 49pt strip
  // centred in our pill so the whole pill face is the page's button; when expanded it fills the sheet.
  const webStrip = expanded ? { flex: 1 } : { position: 'absolute', left: 0, right: 0, top: Math.max(0, (boxH - FORM_H) / 2), height: FORM_H };
  return (
    <View style={box} pointerEvents={hidden ? 'none' : 'auto'}>
      {chrome}
      {live ? (
        <View style={webStrip}>
          <WebView ref={ref} source={{ uri: url }} style={{ flex: 1, backgroundColor: 'transparent', opacity: expanded ? 1 : 0.02 }} originWhitelist={['*']}
            enableApplePay={isApple && Platform.OS === 'ios'} keyboardDisplayRequiresUserAction={false} showsVerticalScrollIndicator={false}
            scrollEnabled={expanded} onMessage={onMessage}
            onLoadStart={() => ev('loadStart')}
            onLoadEnd={() => { ev('loadEnd'); setReady(true); }}
            onError={() => { ev('error'); onError && onError('load'); }} />
        </View>
      ) : null}
    </View>);
}

// ── B161: origin warmer ────────────────────────────────────────────────────────────────────────
// The spinner on the Apple Pay pill is honest: the page really is not up yet. Almost all of that
// wait is cold DNS + TLS + Coinflow's JS bundle, paid on the FIRST WebView that touches their
// origin. WKWebView shares one network cache across the whole app, so loading the form page once,
// early and invisibly, means the real button loads from cache when the sheet opens.
//
// Deliberately inert: no session key, no cents, no webhookInfo — it cannot start or affect a
// payment, and it is 1×1 and untouchable. Mounted only for a SIGNED-IN player, which is also why it
// cannot appear on the guest practice path the OTA gate walks.
export function CoinflowWarmer({ env, merchantId, delayMs = 2500 }) {
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delayMs); return () => clearTimeout(t); }, [delayMs]);
  if (!on || done || !merchantId) return null;
  const uri = baseUrl(env, 'form') + `/form/solana/apple-pay/${encodeURIComponent(merchantId)}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, bottom: 0, left: 0 }}>
      <WebView source={{ uri }} style={{ flex: 1, backgroundColor: 'transparent' }} originWhitelist={['*']}
        javaScriptEnabled cacheEnabled androidLayerType="none"
        onLoadEnd={() => setDone(true)} onError={() => setDone(true)} onHttpError={() => setDone(true)} />
    </View>);
}

// ── full checkout sheet (SDK: CoinflowPurchase) ────────────────────────────────────────────────
export default function CoinflowPurchase({ onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect, onError, style, loaderColor = '#D4F23C', ...props }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  const url = useMemo(() => coinflowUrl({ ...props, which: 'app', route: '/purchase-v2/<MID>' }), [props]);
  const onMessage = useCallback(makeMessageHandler({ onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect, onError, setLoading }),
    [onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect, onError]);
  return (
    <View style={[{ flex: 1, position: 'relative' }, style]}>
      {loading ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 10, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={loaderColor} size="large" />
        </View>) : null}
      <WebView ref={ref} source={{ uri: url }} style={{ flex: 1, backgroundColor: 'transparent' }} originWhitelist={['*']}
        enableApplePay={Platform.OS === 'ios'} keyboardDisplayRequiresUserAction={false} showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        onError={() => { setLoading(false); if (onError) onError('load'); }}
        onHttpError={() => { setLoading(false); if (onError) onError('http'); }} />
    </View>);
}
