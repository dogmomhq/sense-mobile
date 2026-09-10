// ── PAYMENT BRAND MARKS (B138, 2026-09-10) ───────────────────────────────────────────────────
// Where each mark comes from — every one is either the brand's own file or a generic icon that
// belongs to nobody. Nothing here is a redrawn logo, because an approximated brand mark breaks the
// brand's own rules (PayPal, Venmo and Cash App all say so explicitly).
//   Apple Pay        Apple's button must be drawn natively, so Coinflow SHIPS the mark as a PNG in
//                    @coinflowlabs/react-native — vendored to assets/pay/.
//   Cash App         publishes a HOSTED svg and tells integrators to link it, not copy it:
//                    developers.cash.app → "Make sure you use the provided link or code sample."
//   PayPal · Venmo   official files from newsroom.paypal-corp.com/media-resources → assets/pay/.
//   Debit card·Bank  generic icons, not anyone's trademark — drawn here.
//   Crypto           the Bitcoin mark is public domain — drawn here.
import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import Svg, { Path, Rect, Circle as SvgCircle, SvgUri } from 'react-native-svg';
import { COLORS, FONTS } from '../theme';

const HOSTED = { cashApp: 'https://static.afterpaycdn.com/en-US/integration/logo/icon/color.svg' };

// Official brand files. Set to null until the file is in assets/pay/ — a missing require would
// break the bundle, so these are switched on one line at a time.
const MARKS = {
  applePayWhite: require('../../assets/pay/ApplePayWhite.png'),
  applePayBlack: require('../../assets/pay/ApplePayBlack.png'),
  paypal: null,   // ← require('../../assets/pay/paypal.png')
  venmo: null,    // ← require('../../assets/pay/venmo.png')
};

export const BRAND = {
  applePay: { bg: '#FFFFFF', fg: '#000000', tint: '#FFFFFF' },
  paypal:   { bg: '#FFC439', fg: '#003087', tint: '#0070BA' },
  venmo:    { bg: '#008CFF', fg: '#FFFFFF', tint: '#008CFF' },
  cashApp:  { bg: '#00D54B', fg: '#FFFFFF', tint: '#00D54B' },
  crypto:   { bg: COLORS.lime, fg: '#10140C', tint: '#F7931A' },
  card:     { bg: COLORS.lime, fg: '#10140C', tint: '#5BE7E0' },
  bank:     { bg: COLORS.lime, fg: '#10140C', tint: COLORS.lime },
};
const MONOGRAM = { paypal: 'PP', venmo: 'V', cashApp: '$' };

// Generic icons — a card and a bank building. No trademark involved.
function CardGlyph({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth="2" />
      <Rect x="4.5" y="13.5" width="6" height="2.6" rx="1.3" fill={color} />
    </Svg>);
}
function BankGlyph({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 L22 8.5 H2 Z" fill={color} />
      <Rect x="4" y="10" width="2.4" height="7" fill={color} />
      <Rect x="10.8" y="10" width="2.4" height="7" fill={color} />
      <Rect x="17.6" y="10" width="2.4" height="7" fill={color} />
      <Rect x="2" y="18.6" width="20" height="2.4" rx="1.2" fill={color} />
    </Svg>);
}
// The Bitcoin mark is public domain (its designer released it); safe to draw.
function BitcoinGlyph({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx="12" cy="12" r="10" fill={color} />
      <Path d="M9 7h4.1c1.7 0 2.9.9 2.9 2.3 0 1-.5 1.7-1.4 2 1.1.3 1.8 1.1 1.8 2.3 0 1.6-1.3 2.6-3.3 2.6H9V7zm2 2v2.4h1.7c.8 0 1.3-.4 1.3-1.2S13.5 9 12.7 9H11zm0 4.2V16h1.9c.9 0 1.4-.5 1.4-1.4s-.5-1.4-1.4-1.4H11z" fill="#FFFFFF" />
      <Rect x="10.6" y="5" width="1.5" height="3" rx="0.6" fill={color} />
      <Rect x="13.1" y="5" width="1.5" height="3" rx="0.6" fill={color} />
      <Rect x="10.6" y="16" width="1.5" height="3" rx="0.6" fill={color} />
      <Rect x="13.1" y="16" width="1.5" height="3" rx="0.6" fill={color} />
    </Svg>);
}

export function hasOfficialMark(id) { return !!(MARKS[id === 'applePay' ? 'applePayWhite' : id] || HOSTED[id]); }

// `circle` wraps the mark in Triumph's grey disc (the transfer-method list); off for inline pills.
export default function PayLogo({ id, size = 32, on = 'dark', circle = false }) {
  const [failed, setFailed] = useState(false);
  const b = BRAND[id] || {};
  const inner = (() => {
    const key = id === 'applePay' ? (on === 'light' ? 'applePayBlack' : 'applePayWhite') : id;
    const src = MARKS[key];
    if (src) return <Image source={src} style={{ height: size, width: id === 'applePay' ? size * 2.43 : size, resizeMode: 'contain' }} />;
    if (HOSTED[id] && !failed) return <SvgUri width={size} height={size} uri={HOSTED[id]} onError={() => setFailed(true)} />;
    if (id === 'card') return <CardGlyph size={size} color={b.tint || COLORS.cream} />;
    if (id === 'bank') return <BankGlyph size={size} color={b.tint || COLORS.cream} />;
    if (id === 'crypto') return <BitcoinGlyph size={size} color={b.tint || COLORS.lime} />;
    return (
      <Text style={{ fontFamily: FONTS.interBlack, fontSize: size * 0.52, color: on === 'light' ? '#10140C' : (b.tint || COLORS.cream), includeFontPadding: false }}>
        {MONOGRAM[id] || '?'}
      </Text>);
  })();
  if (!circle) return inner;
  const d = size * 2;
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      backgroundColor: on === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(245,241,230,0.10)' }}>{inner}</View>);
}
