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
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, ActivityIndicator, Linking, Platform, Image, StyleSheet } from 'react-native';
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
export function CoinflowMethodButton({ method = 'applePay', color = 'white', height = 56, radius = 28, expanded = false,
  inert = false, inertColor, onApprove, onError, onLoad, onOverlay, style, email, ...props }) {
  const ref = useRef(null);
  const isApple = method === 'applePay';
  // B146: `ready` = Coinflow's page has told us its button is up. Until then a tap lands on a WebView
  // that is still loading and does nothing — which read as "the button is broken". The pill is drawn
  // ONCE, white, and never changes colour or size; only a small spinner at the right edge says
  // "not yet", and it disappears the moment the real button underneath can take the tap.
  const [ready, setReady] = useState(false);
  // The identifier is deliberately kept OUT of the url (SDK does the same) and posted in after load,
  // so changing it never reloads the page.
  const url = useMemo(() => coinflowUrl({ ...props, email: isApple ? email : undefined, which: 'form', routePrefix: 'form', route: FORM_ROUTE[method] || FORM_ROUTE.applePay }), [props, method, isApple, email]);
  const post = useCallback((msg) => { try { ref.current && ref.current.postMessage(msg); } catch {} }, []);
  const handleLoad = useCallback(() => {
    // iOS disables JS injection in a WebView with enableApplePay, so postMessage is a no-op there —
    // which is fine, the Apple Pay page takes everything from the url.
    if (!isApple && IDENTIFIER_MSG[method]) post(JSON.stringify({ method: IDENTIFIER_MSG[method], email: email || undefined }));
    setReady(true);
    if (onLoad) onLoad();
  }, [isApple, method, email, post, onLoad]);
  const onMessage = useCallback((ev) => {
    const raw = ev && ev.nativeEvent && ev.nativeEvent.data;
    if (typeof raw === 'string') { try { const m = JSON.parse(raw); if (m && m.method === 'overlay' && onOverlay) onOverlay(m.data === 'open'); } catch {} }
    makeMessageHandler({ onLoad: handleLoad, onSuccess: onApprove, onError })(ev);
  }, [handleLoad, onApprove, onError, onOverlay]);
  // No width here: the view stretches to its parent, so the caller's horizontal margin is respected.
  // Setting width:'100%' AND a margin made the button wider than the screen.
  // B156: the box CLIPS to the pill. Coinflow's page paints a white, square-cornered body for a frame or
  // two before its button is styled, and the corners showed outside our pill as a white square. For Apple
  // Pay the WebView is also painted invisible — our chrome is the only visual; the WebView stays fully
  // tappable underneath (opacity does not block touches).
  const box = [expanded ? { flex: 1 } : { height }, { position: 'relative', borderRadius: expanded ? 0 : radius, overflow: 'hidden' }, style];
  const waiting = inert || !ready;
  // The one Apple Pay visual. Same JSX in the inert and live branches, at the same tree position, so
  // React keeps the very same view across the swap — nothing remounts, nothing flashes.
  const appleChrome = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { zIndex: 20, borderRadius: radius,
      backgroundColor: color === 'white' ? '#FFFFFF' : '#000000', alignItems: 'center', justifyContent: 'center' }]}>
      <Image source={color === 'white' ? APPLE_MARK.black : APPLE_MARK.white} style={{ height: height * 0.42, aspectRatio: 2.43, resizeMode: 'contain' }} />
      {waiting ? <ActivityIndicator size="small" color={color === 'white' ? '#000000' : '#FFFFFF'} style={{ position: 'absolute', right: height * 0.3 }} /> : null}
    </View>);
  if (inert) return (
    <View style={box}>
      {isApple ? appleChrome
        : <View style={[StyleSheet.absoluteFillObject, { borderRadius: radius, opacity: 0.35, backgroundColor: inertColor || 'rgba(245,241,230,0.14)' }]} />}
    </View>);
  return (
    <View style={box}>
      {isApple ? appleChrome : null}
      <WebView ref={ref} source={{ uri: url }} style={{ flex: 1, backgroundColor: 'transparent', opacity: isApple ? 0.02 : 1 }} originWhitelist={['*']}
        enableApplePay={isApple && Platform.OS === 'ios'} keyboardDisplayRequiresUserAction={false} showsVerticalScrollIndicator={false}
        scrollEnabled={expanded} onMessage={onMessage} onLoadEnd={() => setReady(true)} onError={() => onError && onError('load')} />
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
