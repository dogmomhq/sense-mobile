// ── APP SHELL: the persistent tab container ─────────────────────────────────
// GlassHeader on top (signedIn=false -> SIGN IN lime pill replaces avatar),
// pending-strip slot under the header (pendingCount > 0 ->
// "N MATCHES PENDING · VIEW", per DECISIONS #7/Q6: pending matches surface as
// a tappable strip, never a blocking screen), content slot, 4-cell
// SegmentedNav at the bottom (HOME · HISTORY · PROFILE · LEADERBOARD, badge
// dot on HISTORY while matches are pending). Countdown/question takeovers
// render OUTSIDE this shell.
import React from 'react';
import { View, Text, Pressable, StatusBar } from 'react-native';
import GlassHeader from './components/GlassHeader';
import SegmentedNav from './components/SegmentedNav';
import { COLORS, FONTS, useScale } from './theme';

export function PendingStrip({ count, onPress }) {
  const s = useScale();
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', top: 278 * s, left: 22 * s, right: 22 * s,
      height: 76 * s, borderRadius: 38 * s, backgroundColor: 'rgba(16,20,13,0.82)',
      borderWidth: 1.5 * s, borderColor: COLORS.stakeBorder, zIndex: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 * s }}>
      <View style={{ width: 16 * s, height: 16 * s, borderRadius: 8 * s, backgroundColor: COLORS.lime }} />
      <Text style={{ color: COLORS.lime, fontFamily: FONTS.interExtra, fontSize: 28 * s,
        letterSpacing: 0.08 * 28 * s }}>
        {count} {count === 1 ? 'MATCH' : 'MATCHES'} PENDING · VIEW
      </Text>
    </Pressable>
  );
}

export default function AppShell({
  streak = 8, balance = '$24.50', avatar, handle = null, signedIn = true, onSignIn,
  pendingCount = 0, onPendingPress, onAddFunds,
  activeTab = 'home', onTab, showClock = false, children,
}) {
  const s = useScale();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest, overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" />
      {/* content slot: between header zone and nav */}
      <View style={{ position: 'absolute', top: (pendingCount > 0 ? 370 : 280) * s,
        left: 0, right: 0, bottom: 156 * s, zIndex: 5 }}>
        {children}
      </View>
      <GlassHeader streak={streak} balance={balance} handle={handle}
        {...(avatar ? { avatar } : {})} signedIn={signedIn} onSignIn={onSignIn}
        onPressAdd={onAddFunds} showClock={showClock} />
      {pendingCount > 0 ? <PendingStrip count={pendingCount} onPress={onPendingPress} /> : null}
      <SegmentedNav active={activeTab} onTab={onTab}
        badges={pendingCount > 0 ? { history: true } : {}} />
    </View>
  );
}
