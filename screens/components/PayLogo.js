// ── PAYMENT BRAND MARKS (B134, 2026-09-10) ───────────────────────────────────────────────────
// Where the real marks come from, per brand:
//   Apple Pay        Apple's button must be drawn natively, so Coinflow SHIPS the mark as a PNG in
//                    @coinflowlabs/react-native — vendored to assets/pay/, used by CoinflowMethodButton.
//   PayPal · Venmo   drawn by the brand's own SDK on Coinflow's hosted /form/<chain>/<method>/<MID>
//                    page, which is what their brand rules require. Nothing for us to ship.
//   Cash App · Visa  no standalone button exists, so these are the only rows that would ever need a
//                    file of their own.
// This component is therefore only for the small marks in the PICKER LIST; the pay button itself
// always carries the brand's real button. Anything without a file shows a plain monogram, which is
// not a brand violation — an approximated logo would be.
//
// TO ADD ONE (one line, no other code change): save the official file as assets/pay/<name>.png
// (~120px tall, transparent) and change that brand's `null` below to require(...).
//   Cash App  https://cash.app/press        Visa  https://usa.visa.com/…/visa-brand-assets.html
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
