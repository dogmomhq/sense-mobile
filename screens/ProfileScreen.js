// ── PROFILE (DECISIONS 2026-06-11 #19/#20/Q10 + AUTH ruling) ────────────────
// signedIn=false → sign-in card per batch6/auth.png: "SIGN IN TO SAVE YOUR
//   STREAK", email field, 8 code boxes, lime SIGN IN. (Auth lives under
//   Profile, like live; header shows the SIGN IN pill via AppShell.)
// signedIn=true  → initials avatar hero + handle + member-since, stats grid
//   (Played/W/L/D/Win%/Streak — server S4 fills the data), NET LIFETIME
//   headline, wallet card (balance + DEPOSIT → deposit stub per Q5,
//   WITHDRAW disabled), settings rows, version.
// Badges grid CUT from MVP (Q10) — slot reserved below, do not delete.
// Pure presentational; renders inside AppShell.
import React from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch } from 'react-native';
import InitialsAvatar from './components/InitialsAvatar';
import { COLORS, FONTS, RADII, useScale } from './theme';

const CARD = (s, extra = {}) => ({ backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s,
  borderColor: 'rgba(215,248,74,0.35)', borderRadius: RADII.glass * s, ...extra });

/* ── logged-out: sign-in card ── */
function SignInCard({ email = '', code = ['4', '8', '2', '', '', '', '', ''], onSignIn }) {
  const s = useScale();
  return (
    <View style={[CARD(s), { marginHorizontal: 45 * s, marginTop: 60 * s,
      paddingVertical: 70 * s, paddingHorizontal: 45 * s, alignItems: 'center' }]}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 92 * s, lineHeight: 104 * s,
        color: COLORS.cream, textAlign: 'center', includeFontPadding: false,
        marginBottom: 60 * s }}>SIGN IN TO SAVE{'\n'}YOUR STREAK</Text>
      <TextInput placeholder="EMAIL" placeholderTextColor={COLORS.creamDim} defaultValue={email}
        style={{ alignSelf: 'stretch', borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)',
          borderRadius: 16 * s, paddingVertical: 28 * s, paddingHorizontal: 32 * s,
          color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 34 * s,
          letterSpacing: 0.08 * 34 * s, marginBottom: 44 * s }} />
      <View style={{ flexDirection: 'row', gap: 14 * s, marginBottom: 24 * s }}>
        {code.map((c, i) => (
          <View key={i} style={{ flex: 1, aspectRatio: 0.82, borderWidth: 2 * s,
            borderColor: c ? COLORS.lime : 'rgba(245,241,230,0.3)', borderRadius: 14 * s,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: c ? 'rgba(212,242,60,0.08)' : 'transparent' }}>
            <Text style={{ fontFamily: FONTS.mono, fontSize: 44 * s, color: COLORS.cream }}>{c}</Text>
          </View>))}
      </View>
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim,
        letterSpacing: 0.08 * 26 * s, marginBottom: 56 * s }}>ENTER THE 8-DIGIT CODE WE EMAILED YOU</Text>
      <Pressable onPress={onSignIn} style={{ alignSelf: 'stretch', backgroundColor: COLORS.lime,
        borderRadius: 24 * s, paddingVertical: 40 * s, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C',
          letterSpacing: 0.06 * 60 * s, includeFontPadding: false }}>SIGN IN</Text>
      </Pressable>
    </View>);
}

/* ── logged-in pieces ── */
function StatsGrid({ stats }) {
  const s = useScale();
  const cells = [
    ['PLAYED', String(stats.played)], ['WINS', String(stats.w)], ['LOSSES', String(stats.l)],
    ['DRAWS', String(stats.d)], ['WIN RATE', `${stats.winPct}%`], ['STREAK', `${stats.streak} 🔥`],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 * s }}>
      {cells.map(([label, value]) => (
        <View key={label} style={{ width: '31.5%', flexGrow: 1, backgroundColor: 'rgba(42,40,26,0.8)',
          borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.18)', borderRadius: 18 * s,
          alignItems: 'center', paddingVertical: 28 * s }}>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 58 * s, color: COLORS.cream,
            includeFontPadding: false }}>{value}</Text>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 22 * s, color: COLORS.creamDim,
            letterSpacing: 0.1 * 22 * s, marginTop: 8 * s }}>{label}</Text>
        </View>))}
    </View>);
}

function SettingsRow({ label, right = null, danger = false, onPress }) {
  const s = useScale();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', backgroundColor: 'rgba(16,20,13,0.82)',
      borderWidth: 1.5 * s, borderColor: 'rgba(245,241,230,0.18)', borderRadius: 20 * s,
      paddingVertical: 28 * s, paddingHorizontal: 34 * s, marginBottom: 14 * s }}>
      <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s,
        letterSpacing: 0.08 * 32 * s, color: danger ? '#FF5A48' : COLORS.cream }}>{label}</Text>
      {right || <Text style={{ fontFamily: FONTS.interBold, fontSize: 32 * s,
        color: COLORS.creamDim }}>›</Text>}
    </Pressable>);
}

function LoggedIn({ handle, memberSince, stats, netLifetime, balance, soundsOn,
  onDeposit, onToggleSounds, onPrivacy, onTerms, onHelp, onDeleteAccount, version }) {
  const s = useScale();
  const netPos = !String(netLifetime).startsWith('-');
  return (
    <View style={{ paddingHorizontal: 45 * s }}>
      {/* hero: initials avatar + handle + member-since */}
      <View style={{ alignItems: 'center', marginBottom: 36 * s }}>
        <InitialsAvatar handle={handle} size={260} ring={4} fontSize={104} />
        <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, color: COLORS.wordmark,
          includeFontPadding: false, marginTop: 28 * s }}>{String(handle).toUpperCase()}</Text>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim,
          letterSpacing: 0.12 * 28 * s, marginTop: 10 * s }}>
          MEMBER SINCE {String(memberSince).toUpperCase()}</Text>
      </View>

      {/* stats card */}
      <View style={[CARD(s), { padding: 30 * s, marginBottom: 28 * s }]}>
        <StatsGrid stats={stats} />
        <Text style={{ fontFamily: FONTS.anton, fontSize: 68 * s,
          color: netPos ? COLORS.lime : '#FF5A48', textAlign: 'center',
          includeFontPadding: false, marginTop: 34 * s,
          textShadowColor: COLORS.limeGlow, textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 24 * s }}>NET LIFETIME {netLifetime}</Text>
      </View>

      {/* badges grid CUT from MVP (DECISIONS Q10). Reserved slot — when
          badges ship, the achievement grid renders here, between the stats
          card and the wallet card. Do not repurpose this position. */}

      {/* wallet card (mobile is walletless — this is the credits card) */}
      <View style={[CARD(s), { padding: 34 * s, marginBottom: 28 * s, alignItems: 'center' }]}>
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 28 * s, color: COLORS.creamDim,
          letterSpacing: 0.12 * 28 * s }}>BALANCE</Text>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 76 * s, color: COLORS.lime,
          marginTop: 8 * s, marginBottom: 30 * s }}>{balance}</Text>
        <View style={{ flexDirection: 'row', gap: 20 * s, alignSelf: 'stretch' }}>
          <Pressable onPress={onDeposit} style={{ flex: 1, backgroundColor: COLORS.lime,
            borderRadius: 20 * s, paddingVertical: 30 * s, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: '#10140C',
              letterSpacing: 0.06 * 36 * s }}>DEPOSIT</Text>
          </Pressable>
          {/* withdraw disabled until real money ships */}
          <View style={{ flex: 1, borderWidth: 2.5 * s, borderColor: 'rgba(245,241,230,0.25)',
            borderRadius: 20 * s, paddingVertical: 30 * s, alignItems: 'center', opacity: 0.5 }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: COLORS.creamDim,
              letterSpacing: 0.06 * 36 * s }}>WITHDRAW</Text>
          </View>
        </View>
      </View>

      {/* settings */}
      <SettingsRow label="SOUNDS" onPress={onToggleSounds}
        right={<Switch value={!!soundsOn} onValueChange={onToggleSounds}
          trackColor={{ true: COLORS.lime, false: 'rgba(245,241,230,0.2)' }}
          thumbColor={COLORS.cream} />} />
      <SettingsRow label="PRIVACY" onPress={onPrivacy} />
      <SettingsRow label="TERMS" onPress={onTerms} />
      <SettingsRow label="HELP" onPress={onHelp} />
      <SettingsRow label="DELETE ACCOUNT" danger onPress={onDeleteAccount} />
      <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim,
        textAlign: 'center', marginTop: 20 * s, letterSpacing: 0.1 * 24 * s }}>
        SENSE {version}</Text>
    </View>);
}

export default function ProfileScreen({
  signedIn = true, handle = 'NIGHTOWL88', memberSince = 'Mar 2026',
  stats = { played: 56, w: 41, l: 12, d: 3, winPct: 73, streak: 8 },
  netLifetime = '+$212.40', balance = '$24.50', soundsOn = true, version = 'v0.9.0',
  email = '', code = undefined,
  onSignIn, onDeposit, onToggleSounds, onPrivacy, onTerms, onHelp, onDeleteAccount,
}) {
  const s = useScale();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 * s }}>
      {signedIn ? (
        <LoggedIn handle={handle} memberSince={memberSince} stats={stats}
          netLifetime={netLifetime} balance={balance} soundsOn={soundsOn} version={version}
          onDeposit={onDeposit} onToggleSounds={onToggleSounds} onPrivacy={onPrivacy}
          onTerms={onTerms} onHelp={onHelp} onDeleteAccount={onDeleteAccount} />
      ) : (
        <SignInCard email={email} {...(code ? { code } : {})} onSignIn={onSignIn} />
      )}
    </ScrollView>
  );
}
