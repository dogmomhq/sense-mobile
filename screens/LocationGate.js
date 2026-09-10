// ── LOCATION GATE (B157, 2026-09-10) ─────────────────────────────────────────────────────────
// Triumph pattern, CJ's call: on every app open, before anything real-money, "Let's check your
// location" with the map of where we operate and one button. One fix is good for the server's window
// (an hour) or until the app is closed. The list of states comes from the server's Compliance rules,
// so adding or removing a state in the admin panel changes this screen on the next open.
// Map paths: @svg-maps/usa (MIT), simplified. Alaska/Hawaii inset as drawn by the source.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Alert, SafeAreaView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS, useScale } from './theme';
import USA from '../assets/usa-states.json';

const ALL = Object.keys(USA.states).filter((k) => k !== 'DC');
export default function LocationGate({ httpsBase, supabaseToken, onDone, onSkip, canSkip = false }) {
  const s = useScale();
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [verdict, setVerdict] = useState(null); // { state, allowed }
  useEffect(() => { let alive = true; fetch(`${httpsBase}/api/geo/states`).then((r) => r.json()).then((j) => { if (alive && j && j.ok) setRules(j); }).catch(() => {}); return () => { alive = false; }; }, [httpsBase]);
  const blocked = useMemo(() => new Set((rules && rules.blocked) || []), [rules]);
  const allowedList = useMemo(() => ALL.filter((k) => !blocked.has(k)).sort(), [blocked]);

  async function check() {
    setBusy(true); setErr('');
    let Location; try { Location = require('expo-location'); } catch (e) { setBusy(false); setErr('This version can’t verify location — update the app.'); return; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setBusy(false);
        Alert.alert('Location needed', 'We’re required to confirm your state before real-money play.', [
          { text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => { try { Linking.openSettings(); } catch (e) {} } }]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const r = await fetch(`${httpsBase}/api/gps-fix`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseToken: supabaseToken || '', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) { setBusy(false); setErr(r.status === 401 ? 'Sign in first, then check your location.' : 'Couldn’t verify your location — try again.'); return; }
      setVerdict({ state: j.state, allowed: j.allowed });
      setBusy(false);
      if (j.allowed !== false) onDone && onDone(j);   // allowed or unknown-state: through. Blocked: stay, show why.
    } catch (e) { setBusy(false); setErr('Couldn’t get your location — try again.'); }
  }

  const fill = (k) => (verdict && verdict.state === k) ? (verdict.allowed === false ? '#FF5A48' : COLORS.lime) : (blocked.has(k) ? '#2A2D27' : COLORS.lime);
  // B158 (CJ): everything centred, nothing clipped at the top. SafeAreaView keeps the headline clear of
  // the notch / Dynamic Island; the content block is flex-centred between the top inset and the button,
  // so the screen reads the same on a small phone and a Pro Max instead of hugging the top edge.
  const MAP_W = 940 * s, MAP_H = MAP_W * 746 / 1028;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0E09' }}>
      <View style={{ flex: 1, paddingHorizontal: 56 * s, paddingBottom: 30 * s }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: FONTS.anton, fontSize: 84 * s, lineHeight: 92 * s, color: COLORS.cream, textAlign: 'center', includeFontPadding: false }}>
            Let’s check{'\n'}your location.</Text>
          <Text style={{ fontFamily: FONTS.interSemi, fontSize: 28 * s, lineHeight: 40 * s, color: COLORS.creamDim, textAlign: 'center', marginTop: 26 * s, paddingHorizontal: 20 * s }}>
            We’re required to confirm your location so you can play for real money in your state.</Text>
          <View style={{ marginTop: 44 * s, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={MAP_W} height={MAP_H} viewBox={USA.viewBox}>
              {Object.keys(USA.states).map((k) => <Path key={k} d={USA.states[k]} fill={fill(k)} stroke="#0B0E09" strokeWidth={1.5} />)}
            </Svg>
          </View>
          {verdict && verdict.allowed === false ? (
            <Text style={{ fontFamily: FONTS.interBold, fontSize: 30 * s, lineHeight: 42 * s, color: '#FF5A48', textAlign: 'center', marginTop: 40 * s }}>
              Real-money play isn’t available in {verdict.state}.{'\n'}You can still play for free.</Text>
          ) : (
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 24 * s, lineHeight: 36 * s, color: COLORS.creamDim, textAlign: 'center', marginTop: 40 * s }}>
              {rules ? 'Sense currently operates in ' + allowedList.length + ' states: ' + allowedList.join(', ') + '.' : ' '}</Text>
          )}
          {err ? <Text style={{ fontFamily: FONTS.interBold, fontSize: 26 * s, color: '#FF5A48', textAlign: 'center', marginTop: 24 * s }}>{err}</Text> : null}
        </View>
        <Pressable onPress={check} disabled={busy} style={{ backgroundColor: COLORS.lime, borderRadius: 70 * s, height: 140 * s, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#10140C" /> : <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s, color: '#10140C' }}>Check my location</Text>}
        </Pressable>
        {canSkip || (verdict && verdict.allowed === false) ? (
          <Pressable onPress={onSkip} style={{ alignItems: 'center', paddingTop: 26 * s }}>
            <Text style={{ fontFamily: FONTS.interSemi, fontSize: 28 * s, color: COLORS.creamDim }}>{verdict && verdict.allowed === false ? 'Continue with free play' : 'Not now'}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
