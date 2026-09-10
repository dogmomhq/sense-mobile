// ── COINFLOW PURCHASE (B131, 2026-09-10) ──────────────────────────────────────────────────────
// Coinflow's hosted checkout (Apple Pay · PayPal · Venmo · Cash App · crypto) inside a WebView.
// A faithful, minimal port of `CoinflowPurchase` + `CoinflowWebView` from
// @coinflowlabs/react-native@4.21.0 (Apache-2.0, coinflow-labs-us) — same route, same query
// encoding, same page→native message protocol — for the same reason CoinflowCardForm is a port:
// the package hard-imports @solana/web3.js + bs58 + @nsure-ai at module load.
//
// Apple Pay: react-native-webview's `enableApplePay` (iOS) lets the hosted page run Apple Pay on
// the Web under COINFLOW's merchant id — no entitlement, no Merchant ID, nothing in App Store
// Connect. Cost of that flag: native→page JS injection is off (fine — we never send anything to
// the page; the wallet-signing replies the SDK does are for crypto merchants). Apple Pay cannot be
// tapped in the simulator; real device only.
//
// PayPal / Venmo: the page asks us to open an external URL ({method:'rnredirect'}). We open it
// with Linking; the user pays in the PayPal app / browser and comes back. The hosted page keeps
// polling Coinflow for the outcome and posts {method:'success'} when it lands — but the PHONE
// NEVER DECIDES THAT MONEY ARRIVED: the caller polls /api/deposit/status until the server says
// `settled` (signed Settled webhook). `success` here just means "stop showing the sheet, start
// polling".
//
// Protocol (page → native), from common/CoinflowLibMessageHandlers.js:
//   loaded · success{info} · authDeclined{info} · inputError{info} · inputValid · heightChange:<id>
//   rnredirect{info:{callbackUrl, flow?:'venmo'}} · accountLinked · overlay · redirect(data=url)
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, ActivityIndicator, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import LZString from 'lz-string';

// SDK: CoinflowUtils.getCoinflowAppBaseUrl — the purchase app, not the marketing host.
function appBase(env) {
  if (!env || env === 'prod') return 'https://app.coinflow.cash';
  return `https://app-${env}.coinflow.cash`;            // 'sandbox' → https://app-sandbox.coinflow.cash
}

// SDK: CoinflowUtils.getCoinflowUrl, restricted to the params a fiat session-key merchant uses.
// Route is `/${blockchain}/purchase-v2/${merchantId}`; blockchain defaults to 'solana' in the SDK
// even for fiat-only merchants (it only selects Coinflow's settlement rail, which is theirs).
export function purchaseUrl({ env, merchantId, sessionKey, cents, lockAmount = true, webhookInfo, email, allowedPaymentMethods,
  chargebackProtectionData, chargebackProtectionAccountType, deviceId, theme, disableApplePay, appReturnUrl, supportEmail }) {
  const u = new URL(`/solana/purchase-v2/${encodeURIComponent(merchantId)}`, appBase(env));
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
  if (disableApplePay) q.append('disableApplePay', 'true');
  if (lockAmount) q.append('lockAmount', 'true');
  if (allowedPaymentMethods && allowedPaymentMethods.length) q.append('allowedPaymentMethods', allowedPaymentMethods.join(','));
  if (appReturnUrl) q.append('appReturnUrl', appReturnUrl);
  return u.toString();
}

export default function CoinflowPurchase({ env, merchantId, sessionKey, cents, webhookInfo, email, allowedPaymentMethods, chargebackProtectionData,
  chargebackProtectionAccountType, deviceId, theme, supportEmail, onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect, onError, style, loaderColor = '#D4F23C' }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  const url = useMemo(() => purchaseUrl({ env, merchantId, sessionKey, cents, webhookInfo, email, allowedPaymentMethods, chargebackProtectionData,
    chargebackProtectionAccountType, deviceId, theme, supportEmail }),
    [env, merchantId, sessionKey, cents, webhookInfo, email, allowedPaymentMethods, chargebackProtectionData, chargebackProtectionAccountType, deviceId, theme, supportEmail]);

  const onMessage = useCallback((ev) => {
    const raw = ev && ev.nativeEvent && ev.nativeEvent.data;
    if (typeof raw !== 'string') return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || !m.method) return;
    const method = String(m.method);
    // SDK: RN_REDIRECT_MESSAGE_NAME = 'rnredirect' — PayPal / Venmo hand-off to an external app or browser
    if (method === 'rnredirect' && m.info && m.info.callbackUrl) {
      const cb = String(m.info.callbackUrl);
      const target = m.info.flow === 'venmo' ? `${cb}&presentation=popup&display=browser` : cb; // SDK: openVenmoAppFlow
      if (onExternalRedirect) onExternalRedirect(m.info.flow || 'browser');
      Linking.openURL(target).catch(() => {}); // SDK swallows this too: the page's own status polling surfaces a timeout
      return;
    }
    if (method === 'loaded') { setLoading(false); if (onLoad) onLoad(); return; }
    if (method === 'success') { if (onSuccess) onSuccess(m.info || null); return; }
    if (method === 'authDeclined') { if (onAuthDeclined) onAuthDeclined(m.info || null); return; }
    if (method === 'inputError') { if (onInputError) onInputError(m.info || null); return; }
    if (method === 'redirect' && m.data) { Linking.openURL(String(m.data)).catch(() => {}); return; }
    // inputValid · heightChange:<id> · accountLinked · overlay · updateSubtotal: nothing to do — the sheet is full-height and the amount is locked
  }, [onLoad, onSuccess, onAuthDeclined, onInputError, onExternalRedirect]);

  return (
    <View style={[{ flex: 1, position: 'relative' }, style]}>
      {loading ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={loaderColor} size="large" />
        </View>) : null}
      <WebView ref={ref} source={{ uri: url }} style={{ flex: 1, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        enableApplePay={Platform.OS === 'ios'}                 // SDK: enableApplePay = route.includes('/purchase/') && iOS
        keyboardDisplayRequiresUserAction={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        onError={() => { setLoading(false); if (onError) onError('load'); }}
        onHttpError={() => { setLoading(false); if (onError) onError('http'); }} />
    </View>
  );
}
