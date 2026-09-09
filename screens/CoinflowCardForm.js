// ── COINFLOW CARD FORM (2026-09-08, COINFLOW-INTEGRATION.md §1) ──────────────────────────────
// Coinflow's hosted card entry (number · expiry · CVV) inside a WebView. The card number never
// touches our JS or our server: the page tokenizes it and posts back an opaque `token` that
// only Coinflow can charge (server: lib/payments/coinflow.js). This is a faithful, minimal port
// of `CoinflowCardFormV2` from @coinflowlabs/react-native@4.21.0 (Apache-2.0, coinflow-labs-us).
// We port it instead of installing the package because the package hard-imports
// @solana/web3.js + bs58 + @nsure-ai at module load for its wallet flows — dead weight and a
// boot-crash risk for an app that has no crypto anywhere. Same hosted page, same message
// protocol, so it stays compatible with whatever their SDK ships against.
//
// Protocol (page ↔ native):
//   page → native  {method:'loaded'} | {method:'heightChange', data:<px>} | {method:'tokenize', data:<json|'ERROR …'>}
//   native → page  postMessage('tokenize')  →  resolves {token, expMonth?, expYear?, forterToken?}
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import WebView from 'react-native-webview';
import LZString from 'lz-string';

const DEFAULT_HEIGHT = 56;   // the page reports its real height via heightChange once loaded

function baseUrlFor(env) {
  if (!env || env === 'prod') return 'https://coinflow.cash';
  return `https://${env}.coinflow.cash`;          // 'sandbox' → https://sandbox.coinflow.cash
}

const CoinflowCardForm = forwardRef(function CoinflowCardForm({ merchantId, env = 'sandbox', theme, style, onLoad, onError, loaderColor = '#D4F23C' }, ref) {
  const webViewRef = useRef(null);
  const pendingRef = useRef(null);           // { resolve, reject } of the in-flight tokenize()
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const url = useMemo(() => {
    const u = new URL('/form/v2/card-form', baseUrlFor(env));
    u.searchParams.append('merchantId', merchantId);
    u.searchParams.append('useHeightChange', 'true');
    if (theme) u.searchParams.append('theme', LZString.compressToEncodedURIComponent(JSON.stringify(theme)));
    return u.toString();
  }, [merchantId, env, theme]);

  const onMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }   // not for us
    if (!msg || typeof msg !== 'object') return;
    if (msg.method === 'loaded') { setLoaded(true); if (onLoad) onLoad(); return; }
    if (msg.method === 'heightChange') { const h = Number(msg.data); if (Number.isFinite(h) && h > 0) setHeight(h); return; }
    if (msg.method === 'tokenize' && pendingRef.current) {
      const { resolve, reject } = pendingRef.current; pendingRef.current = null;
      if (typeof msg.data === 'string' && msg.data.startsWith('ERROR')) { reject(new Error(msg.data.replace(/^ERROR\s*/, '') || 'card_invalid')); return; }
      let out = msg.data;
      if (typeof out === 'string') { try { out = JSON.parse(out); } catch { reject(new Error('card_invalid')); return; } }
      if (!out || !out.token) { reject(new Error('card_invalid')); return; }
      resolve(out);
    }
  }, [onLoad]);

  const tokenize = useCallback(() => new Promise((resolve, reject) => {
    if (!webViewRef.current || !loaded) { reject(new Error('card_form_not_ready')); return; }
    if (pendingRef.current) { reject(new Error('tokenize_in_progress')); return; }
    pendingRef.current = { resolve, reject };
    // the page answers within a second; never leave a Pay tap hanging
    setTimeout(() => { if (pendingRef.current && pendingRef.current.resolve === resolve) { pendingRef.current = null; reject(new Error('card_form_timeout')); } }, 20000);
    webViewRef.current.postMessage('tokenize');
  }), [loaded]);

  useImperativeHandle(ref, () => ({ tokenize, loaded }), [tokenize, loaded]);

  return (
    <View style={[{ height, position: 'relative' }, style]}>
      {!loaded ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={loaderColor} />
        </View>
      ) : null}
      <View style={{ flex: 1, opacity: loaded ? 1 : 0 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          onMessage={onMessage}
          onError={() => { if (onError) onError(new Error('card_form_load_failed')); }}
          onHttpError={() => { if (onError) onError(new Error('card_form_load_failed')); }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          originWhitelist={['https://*']}
          keyboardDisplayRequiresUserAction={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    </View>
  );
});

export default CoinflowCardForm;
