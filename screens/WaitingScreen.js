// ── WAITING (DECISIONS 2026-06-11 Q6 FINAL: dedicated waiting screen) ───────
// Full results-style takeover WITH the glass header. Shown after you answer
// while the opponent is still pending (ghost play). Layout per locked mockup
// ui_mockups_v2/batch6/waiting.png:
//   YOU LOCKED (Anton cream) → giant lime time → mystery-eyes chip
//   "AN OPPONENT IS OUT THERE" over subtle radar pulse rings → stake pill →
//   lime PLAY AGAIN (same-tier re-queue, decision #13/Q7) + ghost HISTORY/HOME.
// Pure presentational: no sockets, no timers beyond the radar pulse loop.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, useWindowDimensions, StatusBar, Modal } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GlassHeader from './components/GlassHeader';
import CoverPhoto from './components/CoverPhoto';
import { VideoView } from 'expo-video'; // B73: question clip loops behind the wait (answer already locked - no leak)
import { COLORS, FONTS, RADII, useScale, useVScale } from './theme';
import PressBtn from './components/PressBtn';

// dark panther-eyes plate derived from the locked batch6/waiting.png mockup
const PHOTO = require('../assets/waiting_eyes.png');
const PHOTO_W = 768, PHOTO_H = 1668;

// three staggered expanding lime rings centered on the photo's eye line
function RadarPulse({ cx, cy, freeze = false }) {
  const s = useScale();
  const t = useRef(new Animated.Value(freeze ? 0.45 : 0)).current;
  useEffect(() => {
    if (freeze) return;
    const loop = Animated.loop(Animated.timing(t, {
      toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [freeze, t]);
  const rings = [0, 1 / 3, 2 / 3].map((off, i) => {
    const p = Animated.modulo(Animated.add(t, off), 1);
    const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
    const opacity = p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] });
    const D = 700 * s;
    return (
      <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute',
        left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: D / 2,
        borderWidth: 4.5 * s, borderColor: COLORS.lime, opacity, transform: [{ scale }] }} />
    );
  });
  return <>{rings}</>;
}

export default function WaitingScreen({
  noConn, videoUri = null, player = null, // B90: shared player from ReskinApp — clip continues from the question screen, never restarts
  streak = 8, balance = '$24.50', handle = null, signedIn = true, avatar = undefined, // B89: home avatar everywhere
  lockedTime = '1.42s', stakeText = '$1.00 · WIN $1.90',
  onPlayAgain, onHistory, onHome, showClock = false, freeze = false,
  pushOn = true, onEnablePush,
}) {
  const s = useScale();
  const [showInfo, setShowInfo] = useState(false); // B102: how-matches-work modal (copy CJ-approved)
  const { width, height } = useWindowDimensions();
  // Height-aware anchors (theme.useVScale): buttons + stake pill stack up from
  // the bottom with compressible gaps (g); upper content compresses by vs. On
  // the 1024x2224 canvas these resolve to the exact design-Y values.
  const { vs, g, safeB, headerOff } = useVScale();
  const ghostB = 119 * s + safeB;                       // ghost row (design top 1955, h150)
  const playB = ghostB + (150 + 45 * g) * s;            // PLAY AGAIN (design top 1700, h210)
  const pillB = playB + (210 + 64 * g) * s;             // stake pill (design top 1565)
  const eyesCY = 1287 * s * vs; // radar center: panther eye line baked into waiting_eyes.png

  // B35 (CJ 2026-07-11): fade the whole takeover in over the frozen question instead of
  // hard-cutting — the grace hold now ends in one continuous motion. freeze (snapshot CI)
  // skips the animation for deterministic frames.
  // B73: looping clip behind the takeover. MUTED here — waits can run minutes; a
  // looping animal sound would grate. Sound stays on question + results.
  const wplayer = player; // B90: shared player — no own useVideoPlayer, no restart at mount (volume is 0 forever per B87, so 'muted here' is moot)
  useEffect(() => { // playhead watchdog (same as B72): restart on 2s frame stall
    if (!videoUri || !wplayer || freeze) return;
    let last = -1, stuck = 0;
    const iv = setInterval(() => {
      try {
        const t = wplayer.currentTime || 0;
        if (!wplayer.playing) wplayer.play();
        if (t === last) { stuck++; if (stuck >= 3) { wplayer.replay(); stuck = -2; } } else { stuck = 0; } // B74: 3s + grace — don't restart a clip that's merely janked
        last = t;
      } catch (e) {}
    }, 1000);
    return () => clearInterval(iv);
  }, [videoUri, freeze]);

  const fade = useRef(new Animated.Value(freeze ? 1 : 0)).current;
  useEffect(() => {
    if (freeze) return;
    Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade, freeze]);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: COLORS.forest, overflow: 'hidden', opacity: fade }}>
      <StatusBar barStyle="light-content" />

      {/* full-bleed dark panther-eyes plate (derived from batch6/waiting.png) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0.95, zIndex: 1 }}>
        <CoverPhoto source={PHOTO} naturalW={PHOTO_W} naturalH={PHOTO_H}
          boxW={width} boxH={height} />
      </View>
      {/* B73: question clip under the dark gradient — dimmed so YOU LOCKED still pops */}
      {videoUri ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height, zIndex: 1, opacity: 0.5 }}>
          <VideoView player={wplayer} style={{ width, height }} contentFit="cover" nativeControls={false} />
        </View>
      ) : null}
      <LinearGradient pointerEvents="none"
        colors={['rgba(11,15,10,0.55)', 'rgba(11,15,10,0.2)', 'rgba(11,15,10,0)', 'rgba(11,15,10,0)', 'rgba(11,15,10,0.8)']}
        locations={[0, 0.22, 0.45, 0.66, 0.92]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 }} />

      <GlassHeader streak={streak} balance={balance} handle={handle}
        signedIn={signedIn} showClock={showClock} {...(avatar ? { avatar } : {})} />

      {/* YOU LOCKED + giant lime time */}
      <View style={{ position: 'absolute', top: 350 * s * vs + headerOff, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <Text style={{ fontFamily: FONTS.anton, fontSize: 196 * s, lineHeight: 1.32 * 196 * s,
          color: COLORS.cream, letterSpacing: -0.01 * 196 * s, includeFontPadding: false,
          textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 6 * s },
          textShadowRadius: 24 * s }}>YOU LOCKED</Text>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 215 * s, lineHeight: 250 * s, marginTop: 18 * s,
          color: COLORS.lime, letterSpacing: 0.08 * 215 * s, includeFontPadding: false,
          textShadowColor: COLORS.limeGlow, textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 38 * s }}>{lockedTime}</Text>
      </View>

      {/* radar pulse rings around the mystery eyes */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0,
        bottom: 0, zIndex: 5 }}>
        <RadarPulse cx={width / 2} cy={eyesCY} freeze={freeze} />
      </View>

      {/* mystery-opponent chip (#7: pre-reveal treatment, opponent unknown) */}
      <View style={{ position: 'absolute', top: 1040 * s * vs + headerOff, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <View style={{ backgroundColor: 'rgba(16,20,13,0.72)', borderWidth: 1.5 * s,
          borderColor: 'rgba(245,241,230,0.25)', borderRadius: RADII.stake * s,
          paddingVertical: 18 * s, paddingHorizontal: 42 * s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 36 * s,
              letterSpacing: 0.1 * 36 * s, color: COLORS.cream }}>{noConn ? 'NO CONNECTION — RECONNECTING…' : 'AN OPPONENT IS OUT THERE'}</Text>
            {!noConn && (
              <Pressable onPress={() => setShowInfo(true)} hitSlop={16}
                style={{ marginLeft: 20 * s, width: 52 * s, height: 52 * s, borderRadius: 26 * s,
                  borderWidth: 2.5 * s, borderColor: 'rgba(245,241,230,0.55)',
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONTS.interBlack, fontSize: 30 * s, color: 'rgba(245,241,230,0.8)',
                  includeFontPadding: false }}>i</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* notify promise + enable button (B35, CJ 2026-07-11): the server pushes the result
          on settle/expiry, so this promise is real. If permission is off we don't promise —
          we offer the button instead (never claim a notification we can't deliver). */}
      <View style={{ position: 'absolute', top: 1190 * s * vs + headerOff, left: 40 * s, right: 40 * s, alignItems: 'center', zIndex: 10 }}>
        <Text style={{ fontFamily: FONTS.interExtra, fontSize: 30 * s, letterSpacing: 0.08 * 30 * s,
          color: 'rgba(245,241,230,0.85)', textAlign: 'center' }}>
          {pushOn ? 'YOUR TIME IS LOCKED IN. KEEP PLAYING \u2014 WE\u2019LL NOTIFY YOU THE MOMENT AN OPPONENT MATCHES YOUR SCORE.'
                  : 'YOUR TIME IS LOCKED IN. KEEP PLAYING \u2014 GET NOTIFIED THE MOMENT AN OPPONENT MATCHES YOUR SCORE.'}
        </Text>
        {!pushOn && (
          <PressBtn onPress={onEnablePush} style={{ marginTop: 28 * s, height: 100 * s,
            paddingHorizontal: 52 * s, borderRadius: RADII.stake * s, borderWidth: 3 * s,
            borderColor: COLORS.lime, backgroundColor: 'rgba(16,20,13,0.6)',
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.interBlack, fontSize: 40 * s, color: COLORS.lime,
              letterSpacing: 0.05 * 40 * s, includeFontPadding: false }}>TURN ON NOTIFICATIONS</Text>
          </PressBtn>
        )}
      </View>

      {/* stake pill */}
      <View style={{ position: 'absolute', bottom: pillB, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <View style={{ backgroundColor: COLORS.stakeBg, borderWidth: 1.5 * s, borderColor: COLORS.stakeBorder,
          borderRadius: RADII.stake * s, paddingVertical: 14 * s, paddingHorizontal: 44 * s }}>
          <Text style={{ color: COLORS.cream, fontFamily: FONTS.interExtra, fontSize: 34 * s, lineHeight: 40 * s,
            letterSpacing: 0.06 * 34 * s, includeFontPadding: false }}>{stakeText}</Text>
        </View>
      </View>

      {/* PLAY AGAIN (same tier, decision #13/Q7 sticky tier) */}
      <PressBtn onPress={onPlayAgain} style={{ position: 'absolute', bottom: playB, left: 40 * s,
        right: 40 * s, height: 210 * s, borderRadius: RADII.cta * s, backgroundColor: COLORS.lime,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 * s, zIndex: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 * s }, shadowRadius: 30 * s,
        shadowOpacity: 0.55, elevation: 10 }}>
        <Text style={{ fontFamily: FONTS.interBlack, fontSize: 72 * s, lineHeight: 86 * s, color: '#000',
          letterSpacing: -0.01 * 72 * s, transform: [{ scaleY: 1.22 }], includeFontPadding: false,
          top: 3 * s }}>PLAY AGAIN</Text>
        <Svg width={56 * s} height={62 * s} viewBox="0 0 24 24" preserveAspectRatio="none">
          <Path d="M13 2 L4 14 H11 L10 22 L19 10 H12 L13 2 Z" fill="#000" />
        </Svg>
      </PressBtn>

      {/* ghost HISTORY / HOME row */}
      <View style={{ position: 'absolute', bottom: ghostB, left: 40 * s, right: 40 * s,
        flexDirection: 'row', gap: 26 * s, zIndex: 12 }}>
        {[['HISTORY', onHistory], ['HOME', onHome]].map(([label, fn]) => (
          <PressBtn key={label} onPress={fn} style={{ flex: 1, height: 150 * s,
            borderRadius: RADII.ghost * s, borderWidth: 3 * s, borderColor: COLORS.ghostBorder,
            backgroundColor: 'rgba(16,20,13,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONTS.interExtra, fontSize: 42 * s,
              letterSpacing: 0.16 * 42 * s, color: COLORS.cream }}>{label}</Text>
          </PressBtn>
        ))}
      </View>
      {/* B102: HOW MATCHES WORK (copy CJ-approved 2026-08-23) */}
      <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 40 * s }}>
          <View style={{ width: '100%', maxWidth: 620 * s, backgroundColor: '#161b12', borderWidth: 2.5 * s,
            borderColor: 'rgba(215,248,74,0.55)', borderRadius: 30 * s, padding: 52 * s }}>
            <Text style={{ fontFamily: FONTS.anton, fontSize: 62 * s, color: COLORS.cream,
              letterSpacing: 0.02 * 62 * s, marginBottom: 34 * s }}>HOW MATCHES WORK</Text>
            {[
              'Your answer and time are locked in \u2014 they can\u2019t be changed.',
              'The next player who enters this tier gets the same animal. Fastest correct answer takes the prize.',
              'You don\u2019t have to wait. Play more rounds now \u2014 every score stays locked and matches on its own. We\u2019ll notify you the moment each result lands.',
              'Same speed, or both wrong? It\u2019s a tie \u2014 your full entry comes back.',
            ].map((p, i) => (
              <Text key={i} style={{ fontFamily: FONTS.interBold, fontSize: 33 * s, lineHeight: 46 * s,
                color: 'rgba(245,241,230,0.92)', marginBottom: 26 * s }}>{p}</Text>
            ))}
            <Pressable onPress={() => setShowInfo(false)} style={{ height: 120 * s, borderRadius: 26 * s,
              backgroundColor: COLORS.lime, alignItems: 'center', justifyContent: 'center', marginTop: 10 * s }}>
              <Text style={{ fontFamily: FONTS.anton, fontSize: 48 * s, color: '#10140C',
                letterSpacing: 0.05 * 48 * s }}>GOT IT</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}
