// ── PAYMENT BRAND MARKS (B138, 2026-09-10) ───────────────────────────────────────────────────
// Where each mark comes from — every one is either the brand's own file or a generic icon that
// belongs to nobody. Nothing here is a redrawn logo, because an approximated brand mark breaks the
// brand's own rules (PayPal, Venmo and Cash App all say so explicitly).
//   Apple Pay        Apple's button must be drawn natively, so Coinflow SHIPS the mark as a PNG in
//                    @coinflowlabs/react-native — vendored to assets/pay/.
//   Cash App         publishes a HOSTED svg and tells integrators to link it, not copy it:
//                    developers.cash.app → "Make sure you use the provided link or code sample."
//   PayPal · Venmo   official files from newsroom.paypal-corp.com/media-resources (PayPal's own
//                    newsroom serves both) → assets/pay/. Resized only: no recolour, no crop, no redraw.
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
  paypal: require('../../assets/pay/paypal.png'),   // PayPal-Monogram-FullColor-RGB, resized only
  venmo: require('../../assets/pay/venmo.png'),     // Venmo_Monogram (their .ai), rendered + resized only
};
// Three shapes of mark, and they cannot be rendered the same way:
//   TILE   Venmo, Cash App — the mark carries its own coloured background, so it IS the badge and
//          fills the slot as a rounded square. No disc behind it.
//   WIDE   Apple Pay — a  Pay lockup at 2.43:1. It can never go in a circle; it gets clipped.
//          Rendered free-standing at its own aspect, which is also how Triumph shows it.
//   GLYPH  PayPal, Bitcoin, card, bank — transparent, so they need a disc behind them in a list,
//          and stand alone in a menu.
const TILE = { venmo: true, cashApp: true };
const WIDE = { applePay: 2.43 };

export const BRAND = {
  applePay: { bg: '#FFFFFF', fg: '#000000', tint: '#FFFFFF' },
  paypal:   { bg: '#FFC439', fg: '#003087', tint: '#0070BA' },
  venmo:    { bg: '#008CFF', fg: '#FFFFFF', tint: '#008CFF' },
  cashApp:  { bg: '#00D54B', fg: '#FFFFFF', tint: '#00D54B' },
  crypto:   { bg: COLORS.lime, fg: '#10140C', tint: '#F7931A' },
  card:     { bg: COLORS.lime, fg: '#10140C', tint: '#5BE7E0' },
  bank:     { bg: COLORS.lime, fg: '#10140C', tint: COLORS.lime },
};
const MONOGRAM = { cashApp: '$' };   // only a brand with no bundled file still needs a letter

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

// The raw mark at its natural aspect. `h` is its height.
function Mark({ id, h, on, onFail, failed }) {
  const b = BRAND[id] || {};
  const key = id === 'applePay' ? (on === 'light' ? 'applePayBlack' : 'applePayWhite') : id;
  const src = MARKS[key];
  if (src) return <Image source={src} style={{ height: h, width: h * (WIDE[id] || 1), resizeMode: 'contain' }} />;
  if (HOSTED[id] && !failed) return <SvgUri width={h} height={h} uri={HOSTED[id]} onError={onFail} />;
  if (id === 'card') return <CardGlyph size={h} color={b.tint || COLORS.cream} />;
  if (id === 'bank') return <BankGlyph size={h} color={b.tint || COLORS.cream} />;
  if (id === 'crypto') return <BitcoinGlyph size={h} color={b.tint || COLORS.lime} />;
  return (
    <Text style={{ fontFamily: FONTS.interBlack, fontSize: h * 0.52, color: on === 'light' ? '#10140C' : (b.tint || COLORS.cream), includeFontPadding: false }}>
      {MONOGRAM[id] || '?'}</Text>);
}

// variant 'mark'  — free-standing, `size` is the mark's height. Every brand reads at the same
//                   weight because nothing is boxed. Used in the deposit menu.
// variant 'badge' — a fixed square slot of `size`: a tile fills it, a glyph sits on a disc inside
//                   it. Used in the withdraw list, where rows need a common left column.
export default function PayLogo({ id, size = 32, on = 'dark', variant = 'mark', circle = false }) {
  const [failed, setFailed] = useState(false);
  const b = BRAND[id] || {};
  const onFail = () => setFailed(true);
  const isTile = !!TILE[id] && !(HOSTED[id] && failed);
  const v = circle ? 'badge' : variant;               // `circle` kept for older call sites

  if (isTile) {
    const box = v === 'badge' ? size : size;
    return (
      <View style={{ width: box, height: box, borderRadius: box * 0.24, overflow: 'hidden', backgroundColor: b.tint || 'transparent' }}>
        {MARKS[id] ? <Image source={MARKS[id]} style={{ width: box, height: box, resizeMode: 'cover' }} />
                   : <SvgUri width={box} height={box} uri={HOSTED[id]} onError={onFail} />}
      </View>);
  }
  if (v === 'mark') return <Mark id={id} h={size} on={on} onFail={onFail} failed={failed} />;

  // badge: transparent glyph on a disc. A WIDE lockup never fits one, so it stays free-standing.
  if (WIDE[id]) return <Mark id={id} h={size * 0.44} on={on} onFail={onFail} failed={failed} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      backgroundColor: on === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(245,241,230,0.10)' }}>
      <Mark id={id} h={size * 0.6} on={on} onFail={onFail} failed={failed} />
    </View>);
}
