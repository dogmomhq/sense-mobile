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
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch, Animated, Platform } from 'react-native';
import InitialsAvatar from './components/InitialsAvatar';
import PressBtn from './components/PressBtn';
import { COLORS, FONTS, RADII, useScale } from './theme';
// Apple sign-in native module — guarded require so web / Expo Go (no native module) never crash.
let AppleAuth = null;
try { if (Platform.OS === 'ios') AppleAuth = require('expo-apple-authentication'); } catch (e) {}

const CARD = (s, extra = {}) => ({ backgroundColor: 'rgba(16,20,13,0.82)', borderWidth: 1.5 * s,
  borderColor: 'rgba(215,248,74,0.35)', borderRadius: RADII.glass * s, ...extra });

/* ── logged-out: sign-in card ───────────────────────────────────────────────
   Demo mode (preview): no onSendCode/onVerify → static mock boxes (locked look).
   Live mode (ReskinApp): controlled email/code + 2-step Supabase OTP flow
   (`step` = 'email' | 'code'); code boxes mirror a hidden numeric input. ── */
const OTP_LEN = 6;      // expected Supabase email OTP length (boxes shown by default)
const OTP_MAX = 10;     // hard cap — Supabase may send 6 OR 8 digit codes; accept up to 10

function SignInCard({ email = '', code = ['4', '8', '2', '', '', '', '', ''], onSignIn,
  onChangeEmail, codeStr = '', onChangeCode, step = null, busy = false, onSendCode, onVerify, onApple }) {
  const s = useScale();
  const live = !!(onSendCode || onVerify);
  // Only show the Apple option when the NATIVE module is actually present (false on the
  // OTA-only build that lacks build 13's native code -> no stray 'OR' with a blank button).
  const [appleOk, setAppleOk] = useState(false);
  useEffect(() => { let m = true; try { if (AppleAuth && AppleAuth.isAvailableAsync) AppleAuth.isAvailableAsync().then(v => { if (m) setAppleOk(!!v); }).catch(() => {}); } catch (e) {} return () => { m = false; }; }, []);
  // boxes expand past OTP_LEN if the user types/pastes a longer code (max OTP_MAX)
  const N = live ? Math.min(OTP_MAX, Math.max(OTP_LEN, codeStr.length)) : code.length;
  const boxes = live
    ? Array.from({ length: N }, (_, i) => codeStr[i] || '')
    : code;
  // shrink boxes so longer codes still fit the card width (6 boxes = design size)
  const bw = N <= OTP_LEN ? 92 : Math.floor((OTP_LEN * 92 + (OTP_LEN - 1) * 14 - (N - 1) * 14) / N);
  const bh = Math.round(bw * 114 / 92);
  const bf = N <= OTP_LEN ? 44 : Math.max(28, Math.round(44 * bw / 92));
  const showCode = !live || step === 'code';
  // explicit flow states: idle → SENDING…/SIGNING IN… (disabled + pulse) → step transition / toast
  const ctaLabel = busy ? (step === 'code' ? 'SIGNING IN…' : 'SENDING…')
    : (!live ? 'SIGN IN' : step === 'code' ? 'SIGN IN' : 'SEND CODE');
  const onCta = !live ? onSignIn : (step === 'code' ? onVerify : onSendCode);
  // idle-disabled when there's nothing to send (taps used to silently no-op in App.js)
  const ctaDisabled = busy || (live && (step === 'code' ? !codeStr.trim() : !email.trim()));
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!busy) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: 450, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [busy]);
  return (
    <View style={[CARD(s), { marginHorizontal: 45 * s, marginTop: 60 * s,
      paddingVertical: 70 * s, paddingHorizontal: 45 * s, alignItems: 'center' }]}>
      <Text style={{ fontFamily: FONTS.anton, fontSize: 92 * s, lineHeight: 1.32 * 92 * s,
        color: COLORS.cream, textAlign: 'center', includeFontPadding: false,
        marginBottom: 60 * s }}>SIGN IN TO SAVE{'\n'}YOUR STREAK</Text>
      <TextInput placeholder="EMAIL" placeholderTextColor={COLORS.creamDim}
        {...(live ? { value: email, onChangeText: onChangeEmail } : { defaultValue: email })}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        style={{ alignSelf: 'stretch', borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.5)',
          borderRadius: 16 * s, paddingVertical: 28 * s, paddingHorizontal: 32 * s,
          color: COLORS.cream, fontFamily: FONTS.interBold, fontSize: 34 * s,
          letterSpacing: 0.08 * 34 * s, marginBottom: 44 * s }} />
      {showCode ? (
        <>
          <View style={{ flexDirection: 'row', gap: 14 * s, marginBottom: 24 * s }}>
            {boxes.map((c, i) => (
              <View key={i} style={{ width: bw * s, height: bh * s, borderWidth: 2 * s,
                borderColor: c ? COLORS.lime : 'rgba(245,241,230,0.3)', borderRadius: 14 * s,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: c ? 'rgba(212,242,60,0.08)' : 'transparent' }}>
                <Text style={{ fontFamily: FONTS.mono, fontSize: bf * s, color: COLORS.cream }}>{c}</Text>
              </View>))}
            {live ? (
              <TextInput value={codeStr} onChangeText={(t) => onChangeCode && onChangeCode(t.replace(/[^0-9]/g, '').slice(0, OTP_MAX))}
                keyboardType="number-pad" autoFocus caretHidden
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  opacity: 0.02, color: 'transparent' }} />
            ) : null}
          </View>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim,
            letterSpacing: 0.08 * 26 * s, marginBottom: 56 * s }}>
            {live ? 'ENTER THE CODE FROM YOUR EMAIL' : 'ENTER THE 8-DIGIT CODE WE EMAILED YOU'}</Text>
        </>
      ) : (
        <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: COLORS.creamDim,
          letterSpacing: 0.08 * 26 * s, marginBottom: 56 * s }}>WE'LL EMAIL YOU A ONE-TIME CODE</Text>
      )}
      <PressBtn onPress={onCta} disabled={ctaDisabled} style={{ alignSelf: 'stretch', backgroundColor: COLORS.lime,
        borderRadius: 24 * s, paddingVertical: 40 * s, alignItems: 'center',
        opacity: busy ? 0.75 : ctaDisabled ? 0.5 : 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Animated.Text style={{ fontFamily: FONTS.anton, fontSize: 60 * s, color: '#10140C',
          letterSpacing: 0.06 * 60 * s, includeFontPadding: false, opacity: pulse }}>{ctaLabel}</Animated.Text>
      </PressBtn>
      {live && onApple && appleOk && step !== 'code' ? (
        <>
          <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim,
            letterSpacing: 0.1 * 24 * s, marginTop: 40 * s, marginBottom: 24 * s }}>OR</Text>
          <AppleAuth.AppleAuthenticationButton
            buttonType={AppleAuth.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuth.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={24 * s}
            style={{ alignSelf: 'stretch', height: 104 * s }}
            onPress={onApple} />
        </>
      ) : null}
    </View>);
}

/* ── logged-in pieces ── */
function StatsGrid({ stats }) {
  const s = useScale();
  const cells = [
    ['PLAYED', String(stats.played)], ['WINS', String(stats.w)], ['LOSSES', String(stats.l)],
    ['DRAWS', String(stats.d)],
    (stats.accuracy != null ? ['ACCURACY', `${stats.accuracy}%`] : ['WIN RATE', `${stats.winPct}%`]),
    ['STREAK', `${stats.streak} 🔥`],
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
  onDeposit, onToggleSounds, onPrivacy, onTerms, onHelp, onDeleteAccount, onSignOut, version,
  onRename }) {
  const s = useScale();
  const netPos = !String(netLifetime).startsWith('-');
  // Phase 6 (gap leftover): tap name → inline edit. 3-16 chars [a-zA-Z0-9_]
  // (mirrors App.js doRename's validation — the server is the final word and
  // rename-result drives the toast + displayName update).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const draftOk = /^[a-zA-Z0-9_]{3,16}$/.test(draft.trim());
  const startEdit = () => { if (onRename) { setDraft(String(handle)); setEditing(true); } };
  const save = () => { if (draftOk && onRename) { onRename(draft.trim()); setEditing(false); } };
  return (
    <View style={{ paddingHorizontal: 45 * s }}>
      {/* hero: initials avatar + handle (tap to rename) + member-since */}
      <View style={{ alignItems: 'center', marginBottom: 36 * s }}>
        <InitialsAvatar handle={handle} size={260} ring={4} fontSize={104} />
        {editing ? (
          <View style={{ alignItems: 'center', marginTop: 28 * s, alignSelf: 'stretch' }}>
            <TextInput value={draft} onChangeText={(t) => setDraft(t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16))}
              autoFocus autoCapitalize="none" autoCorrect={false} maxLength={16}
              onSubmitEditing={save}
              style={{ alignSelf: 'stretch', borderWidth: 2 * s, borderColor: 'rgba(215,248,74,0.6)',
                borderRadius: 16 * s, paddingVertical: 18 * s, paddingHorizontal: 28 * s,
                color: COLORS.cream, fontFamily: FONTS.anton, fontSize: 72 * s,
                textAlign: 'center' }} />
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s, color: COLORS.creamDim,
              letterSpacing: 0.08 * 24 * s, marginTop: 12 * s }}>3-16 CHARS · LETTERS, NUMBERS, _</Text>
            <View style={{ flexDirection: 'row', gap: 18 * s, marginTop: 18 * s }}>
              <Pressable onPress={save} disabled={!draftOk}
                style={{ backgroundColor: COLORS.lime, opacity: draftOk ? 1 : 0.4, borderRadius: 18 * s,
                  paddingVertical: 18 * s, paddingHorizontal: 54 * s }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: '#10140C',
                  letterSpacing: 0.06 * 32 * s }}>SAVE</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(false)}
                style={{ borderWidth: 2 * s, borderColor: 'rgba(245,241,230,0.35)', borderRadius: 18 * s,
                  paddingVertical: 18 * s, paddingHorizontal: 44 * s }}>
                <Text style={{ fontFamily: FONTS.interExtra, fontSize: 32 * s, color: COLORS.creamDim,
                  letterSpacing: 0.06 * 32 * s }}>CANCEL</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={startEdit} style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 96 * s, color: COLORS.wordmark,
              includeFontPadding: false, marginTop: 28 * s }}>{String(handle).toUpperCase()}</Text>
            {onRename ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 24 * s,
              color: COLORS.creamDim, letterSpacing: 0.1 * 24 * s, marginTop: 6 * s }}>TAP TO EDIT ✎</Text> : null}
          </Pressable>
        )}
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
      {onSignOut ? <SettingsRow label="LOG OUT" danger onPress={onSignOut} /> : null}
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
  onSignIn, onDeposit, onToggleSounds, onPrivacy, onTerms, onHelp, onDeleteAccount, onRename,
  // live OTP wiring (ReskinApp)
  onChangeEmail, codeStr = '', onChangeCode, step = null, busy = false, onSendCode, onVerify, onApple, onSignOut,
}) {
  const s = useScale();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 * s }}>
      {signedIn ? (
        <LoggedIn handle={handle} memberSince={memberSince} stats={stats}
          netLifetime={netLifetime} balance={balance} soundsOn={soundsOn} version={version}
          onDeposit={onDeposit} onToggleSounds={onToggleSounds} onPrivacy={onPrivacy}
          onTerms={onTerms} onHelp={onHelp} onDeleteAccount={onDeleteAccount} onSignOut={onSignOut}
          onRename={onRename} />
      ) : (
        <View>
          <SignInCard email={email} {...(code ? { code } : {})} onSignIn={onSignIn}
            onChangeEmail={onChangeEmail} codeStr={codeStr} onChangeCode={onChangeCode}
            step={step} busy={busy} onSendCode={onSendCode} onVerify={onVerify} onApple={onApple} />
          {/* Apple 5.1.1(v): device-bound accounts (no email) are still accounts — they hold a
              handle, credits and history, so deletion must be reachable without signing in. */}
          {onDeleteAccount ? (
            <View style={{ paddingHorizontal: 45 * s, marginTop: 24 * s }}>
              <SettingsRow label="DELETE ACCOUNT" danger onPress={onDeleteAccount} />
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
