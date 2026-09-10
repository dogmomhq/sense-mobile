// ── PAYMENT BRAND MARKS (B133, 2026-09-10) ───────────────────────────────────────────────────
// Every payment brand publishes its own logo files and REQUIRES you to use them — a hand-drawn
// approximation breaks their brand guidelines (and PayPal/Venmo/Cash App all say so explicitly).
// So this file loads official assets and nothing else; anything without one falls back to a plain
// monogram until the real file is dropped in.
//
// TO ADD A BRAND (one line each, no other code changes):
//   1. download the official asset and save it as assets/pay/<name>.png (or .svg → export to png,
//      ~120px tall, transparent background)
//   2. change that brand's `null` below to require('../../assets/pay/<name>.png')
//
//   PayPal    https://www.paypal.com/us/webapps/mpp/logo-center      → assets/pay/paypal.png
//   Venmo     https://venmo.com/about/brand/                          → assets/pay/venmo.png
//   Cash App  https://cash.app/press                                  → assets/pay/cashapp.png
//   Visa      https://usa.visa.com/run-your-business/small-business-tools/payment-technology/visa-brand-assets.html
//   Mastercard https://brand.mastercard.com/brandcenter/mastercard-brand-mark.html
//
// Apple Pay ships with @coinflowlabs/react-native (Apache-2.0) — vendored here, same files their
// SDK renders over the hosted Apple Pay button, which is how Apple's guidelines want it drawn.
import React from 'react';
import { View, Text, Image } from 'react-native';
import { COLORS, FONTS } from '../theme';

const MARKS = {
  applePayWhite: require('../../assets/pay/ApplePayWhite.png'), // white mark, for dark buttons
  applePayBlack: require('../../assets/pay/ApplePayBlack.png'), // black mark, for light buttons
  paypal: null,   // ← require('../../assets/pay/paypal.png')
  venmo: null,    // ← require('../../assets/pay/venmo.png')
  cashApp: null,  // ← require('../../assets/pay/cashapp.png')
  visa: null,     // ← require('../../assets/pay/visa.png')
  bank: null,     // generic — a mark is not required, the monogram is fine
  crypto: null,
};
// Brand colors, used for the fallback monogram and for each method's pay button.
export const BRAND = {
  applePay: { bg: '#FFFFFF', fg: '#000000', tint: '#FFFFFF' },
  paypal:   { bg: '#FFC439', fg: '#003087', tint: '#0070BA' },
  venmo:    { bg: '#008CFF', fg: '#FFFFFF', tint: '#008CFF' },
  cashApp:  { bg: '#00D54B', fg: '#FFFFFF', tint: '#00D54B' },
  crypto:   { bg: COLORS.lime, fg: '#10140C', tint: COLORS.lime },
  card:     { bg: COLORS.lime, fg: '#10140C', tint: COLORS.cream },
  bank:     { bg: COLORS.lime, fg: '#10140C', tint: COLORS.cream },
};
const MONOGRAM = { applePay: '', paypal: 'PP', venmo: 'V', cashApp: '$', crypto: '₿', card: '▭', bank: '⌂' };

export function hasOfficialMark(id) { return !!MARKS[id === 'applePay' ? 'applePayWhite' : id]; }

// `id` is a method id (applePay | paypal | venmo | cashApp | crypto | card | bank).
// `on` = the background it sits on: 'dark' (our UI) or 'light' (a white button).
export default function PayLogo({ id, size = 32, on = 'dark' }) {
  const key = id === 'applePay' ? (on === 'light' ? 'applePayBlack' : 'applePayWhite') : id;
  const src = MARKS[key];
  if (src) return <Image source={src} style={{ height: size, width: size * 2.43, resizeMode: 'contain' }} />;
  const b = BRAND[id] || {};
  return (
    <View style={{ width: size * 1.2, height: size * 1.2, borderRadius: size * 0.6, alignItems: 'center', justifyContent: 'center',
      backgroundColor: on === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(245,241,230,0.12)' }}>
      <Text style={{ fontFamily: FONTS.interBlack, fontSize: size * 0.55, color: on === 'light' ? '#10140C' : (b.tint || COLORS.cream), includeFontPadding: false }}>
        {MONOGRAM[id] || '?'}
      </Text>
    </View>);
}
