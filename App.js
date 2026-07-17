import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ImageBackground, Pressable, StyleSheet, SafeAreaView, StatusBar, ScrollView, Animated, Easing, Platform, useWindowDimensions, TextInput, Share, PanResponder, AppState, Alert, Linking } from 'react-native';
// Skia on native only (Expo Go SDK56 bundles it). Web/CI uses the RN-View fallback (CanvasKit renders blank headless).
let SK = null; // Skia removed: explosion renders via react-native-svg (Confetti)
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function ah(a){const v=Math.max(0,Math.min(255,Math.round(a*255)));return v.toString(16).padStart(2,'0');}
import Svg, { Circle, Polygon, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, formatTime, getReasonText, generatePlayerName } from './gameEngine.js';
import { setServerUrl, connectWS, wsSend, isConnected, disconnectWS, onConnState } from './websocket.js';
import { queue, asyncAnswer, answer as roomAnswer, rttPong, pong, cancelMatch, PREVIEW_SERVER_WS } from './protocol';
import { createChallenge, acceptChallenge, requestRematch, closeChallenge, handleChallengeMessage, onChallengeChange, getChallenge } from './challengeService.js';
import { supabase } from './supabaseClient';
import { runAttestation } from './attest'; // P2 observe mode — silent, never blocks
import { ensurePushRegistration, getPushStatus, requestPushPermission } from './push'; // P2 ask-after-answer + B35 waiting-screen enable button

// ===== RESKIN feature flag (branch reskin-ui) ================================
// true  -> render the new pixel-locked UI (screens/ReskinApp.js) on top of the
//          UNCHANGED state machine below. Every WS handler / logic function in
//          this file stays byte-identical; ReskinApp is a pure render layer.
// false -> the original UI below renders exactly as on main.
import ReskinApp from './screens/ReskinApp';
import { setSfxEnabled } from './screens/sfx';
const RESKIN = true;
// RESKIN_CREDITS: flip online matches to SERVER-SIDE credits. The server escrows the stake at
// queue time (append-only ledger 'entry' row), refunds on cancel/expiry, pays on settle. The
// local applyCredit stub becomes a no-op so credits never move twice; the displayed balance is
// the SERVER balance (hydrateHistory pulls /history balance after every credit-moving event).
const RESKIN_CREDITS = RESKIN && true;
const CHALLENGE_ENABLED = false; // 2026-07-02 CJ: friend-room/challenge mode hidden (no UI entry anyway) — may return later; flip to restore
const RESKIN_TIER_BY_CENTS = { 50: 1, 100: 2, 500: 3, 10000: 4, 200: 5, 400: 6, 800: 7, 1600: 8, 3200: 9, 6400: 10, 12800: 11 }; // fixed-prize ladder (phase 2, 2026-07-16) — mirrors server lib/economy.js TIERS. Indices are append-only wire values; 3 ($5) + 4 ($100) are retired legacy, kept so old installs still map, never reused.

const TIME_LIMIT = 10000;
const SERVER_WS = PREVIEW_SERVER_WS;
const HTTPS_BASE = SERVER_WS.replace('wss://', 'https://').replace('ws://', 'http://');
setServerUrl(SERVER_WS);
const C = { accent:'#6C63FF', win:'#22C55E', lose:'#EF4444', draw:'#F59E0B', text:'#1A1A2E', text2:'#6B7B94', border:'rgba(0,0,0,0.08)', card:'rgba(255,255,255,0.95)', page:'#F0F0F3' };
const F = { r:'Inter-Regular', m:'Inter-Medium', s:'Inter-SemiBold', b:'Inter-Bold', x:'Inter-ExtraBold', k:'Inter-Black' };
const BG = 'https://dogmomhq.github.io/sense-react-staging/app/assets/background.jpg';
const CIRC54 = 2 * Math.PI * 54;
function hap(style) { try { Haptics.impactAsync(style); } catch (e) {} }
// ===== sound effects (native only; hosted tones; gated by the in-app Sound toggle) =====
let SFX = null; let soundOn = false;
function initSfx() {
  if (SFX || Platform.OS === 'web') return;
  try {
    const { createAudioPlayer } = require('expo-audio');
    const base = 'https://dogmomhq.github.io/sense-react-staging/app/assets/sounds/';
    SFX = { correct: createAudioPlayer({ uri: base + 'correct.wav' }), wrong: createAudioPlayer({ uri: base + 'wrong.wav' }), win: createAudioPlayer({ uri: base + 'win.wav' }), tap: createAudioPlayer({ uri: base + 'tap.wav' }) };
  } catch (e) { SFX = null; }
}
function playSfx(name) { if (!soundOn || !SFX || !SFX[name]) return; try { SFX[name].seekTo(0); SFX[name].play(); } catch (e) {} }
// ===== analytics (PostHog; native only, guarded — never breaks web/CI) =====
let PH = null; let PHProvider = null;
function initAnalytics() {
  if (PH || Platform.OS === 'web') return;
  try {
    const lib = require('posthog-react-native');
    PH = new lib.PostHog('phc_w2H7XVqRQaFNGrZ4aJXCdxpMHVA6enLHXFLCbk5MFocG', { host: 'https://us.i.posthog.com', enableSessionReplay: true });
    PHProvider = lib.PostHogProvider || null;
  } catch (e) { PH = null; }
}
function identify(id, props) { try { if (PH && id) PH.identify(String(id), props || {}); } catch (e) {} }
function captureError(err, ctx) { try { if (!PH) return; if (PH.captureException) PH.captureException(err, ctx || {}); else PH.capture('$exception', { $exception_message: String((err && err.message) || err), $exception_type: (err && err.name) || 'Error', ...(ctx || {}) }); } catch (e) {} }
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, info) { try { captureError(e, { componentStack: info && info.componentStack, fatal: true }); } catch (_) {} }
  render() { if (this.state.hasError) return (<View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',padding:24}}><Text style={{fontSize:16,color:'#1A1A2E',textAlign:'center',fontWeight:'600'}}>Something went wrong.</Text><Text style={{fontSize:13,color:'#6B7B94',textAlign:'center',marginTop:8}}>Please reopen the app.</Text></View>); return this.props.children; }
}
function track(event, props) { try { if (PH) PH.capture(event, props || {}); } catch (e) {} }

const BANNERS = {
  win_blowout:["DESTROYED","WRECKED","NOT EVEN CLOSE"], win_comfortable:["LET'S GO","EASY MONEY","TOO FAST"],
  win_photo:["BY A HAIR","BARELY","CLUTCH"], win_opp_wrong:["BUILT DIFFERENT","KNOWLEDGE","BRAIN > SPEED"],
  win_opp_timeout:["FREE MONEY","THEY GHOSTED","EASY W"], loss_blowout:["GOT COOKED","DESTROYED","OOF"],
  loss_comfortable:["ALMOST HAD IT","CLOSE ONE","NEXT TIME"], loss_photo:["SO CLOSE","HEARTBREAKER","BY A HAIR"],
  loss_you_wrong:["NEXT ONE'S YOURS","SHAKE IT OFF","RUN IT BACK"], loss_you_timeout:["FELL ASLEEP","WAKE UP","TOO SLOW"],
  draw_same_time:["DEAD HEAT","TWINS","NO WAY"], draw_both_wrong:["STALEMATE","NOBODY WINS","YIKES"], draw_both_timeout:["NOBODY HOME","GHOST TOWN","CRICKETS"],
};
function pickBanner(result, myCorrect, oppCorrect, myTime, oppTime) {
  const both = myCorrect && oppCorrect, a = myTime != null ? myTime/1000 : null, b = oppTime != null ? oppTime/1000 : null;
  let k;
  if (result === 'win') { if (!oppCorrect && oppTime == null) k='win_opp_timeout'; else if (!oppCorrect) k='win_opp_wrong'; else if (both && a && b && Math.abs(a-b)<0.15) k='win_photo'; else if (both && a && b && Math.abs(a-b)>2) k='win_blowout'; else k='win_comfortable'; }
  else if (result === 'loss') { if (!myCorrect && myTime == null) k='loss_you_timeout'; else if (!myCorrect) k='loss_you_wrong'; else if (both && a && b && Math.abs(a-b)<0.15) k='loss_photo'; else if (both && a && b && Math.abs(a-b)>2) k='loss_blowout'; else k='loss_comfortable'; }
  else { if (myTime==null && oppTime==null) k='draw_both_timeout'; else if (!myCorrect && !oppCorrect) k='draw_both_wrong'; else k='draw_same_time'; }
  const m = BANNERS[k] || BANNERS.draw_both_wrong; return m[Math.floor(Math.random()*m.length)];
}

// Stage 1 — VERBATIM web .cr-confetti-up: size 5+rand*9, dx (rand-.5)*300, dy -(100+rand*240),
// rot rand*900-450, dur 0.6+rand*0.5s, from left:50% top:55%, ease-out, scale 1->0.3, opacity 1/1@60%/0.
function PUp({ color, delay }) {
  const t = useRef(new Animated.Value(0)).current;
  const dx = useRef((Math.random()-0.5)*300).current, dy = useRef(-(100+Math.random()*240)).current;
  const rot = useRef(Math.random()*900-450).current, sz = useRef(5+Math.random()*9).current, sq = useRef(Math.random()>0.4).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:600+Math.random()*500,delay,easing:Easing.out(Easing.ease),useNativeDriver:true}).start(); }, []);
  const translateX = t.interpolate({inputRange:[0,1],outputRange:[0,dx]});
  const translateY = t.interpolate({inputRange:[0,1],outputRange:[0,dy]});
  const opacity = t.interpolate({inputRange:[0,0.6,1],outputRange:[1,1,0]});
  const scale = t.interpolate({inputRange:[0,1],outputRange:[1,0.3]});
  const rotate = t.interpolate({inputRange:[0,1],outputRange:['0deg',rot+'deg']});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', left:'50%', top:'55%', width:sz, height:sz*0.6, backgroundColor:color, borderRadius:sq?1:sz, opacity, transform:[{translateX},{translateY},{scale},{rotate}] }} />;
}
// Stage 2 — VERBATIM web .cr-confetti-gravity: dx2 (rand-.5)*220, dy2 120+rand*200, from left:30-70% top:10-30%,
// rot rand*360, dur 0.8+rand*0.6s, ease-in, opacity 1->0. Spawned after the up particle's dur*600+rand*200.
function PFall({ color, delay }) {
  const t = useRef(new Animated.Value(0)).current;
  const x0 = useRef(30+Math.random()*40).current, y0 = useRef(10+Math.random()*20).current;
  const dx = useRef((Math.random()-0.5)*220).current, dy = useRef(120+Math.random()*200).current;
  const rot = useRef(Math.random()*360).current, sz = useRef(5+Math.random()*9).current, sq = useRef(Math.random()>0.4).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:800+Math.random()*600,delay,easing:Easing.in(Easing.ease),useNativeDriver:true}).start(); }, []);
  const translateX = t.interpolate({inputRange:[0,1],outputRange:[0,dx]});
  const translateY = t.interpolate({inputRange:[0,1],outputRange:[0,dy]});
  const opacity = t.interpolate({inputRange:[0,1],outputRange:[1,0]});
  const rotate = t.interpolate({inputRange:[0,1],outputRange:['0deg',rot+'deg']});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', left:x0+'%', top:y0+'%', width:sz, height:sz*0.6, backgroundColor:color, borderRadius:sq?1:sz, opacity, transform:[{translateX},{translateY},{rotate}] }} />;
}
function Confetti({ type }) {
  const pal = { win:['#22C55E','#6C63FF','#F59E0B','#00D4AA','#fff','#34D399','#A78BFA','#EC4899'], loss:['#EF4444','#991B1B','#7F1D1D','#6B7B94'], draw:['#F59E0B','#FBBF24','#6B7B94','#ddd','#fff'] };
  const colors = pal[type] || pal.draw, n = type==='win'?100:type==='draw'?35:20;
  // two stages like web: an up-burst AND a delayed gravity rain (~2x particles = more juice)
  const ups = useRef([...Array(n)].map((_,i)=>({color:colors[i%colors.length],delay:Math.random()*100}))).current;
  const falls = useRef([...Array(n)].map((_,i)=>({color:colors[i%colors.length],delay:360+Math.random()*500}))).current;
  return <>{ups.map((p,i)=><PUp key={'u'+i} {...p} />)}{falls.map((p,i)=><PFall key={'f'+i} {...p} />)}</>;
}
// NATIVE explosion drawn in Skia (deterministic, faithful primitives) — same math validated against web in explosion_ref.py.
function SkiaExplosion({ kind }) {
  const { width: w, height: h } = useWindowDimensions();
  const parts = useRef(null);
  if (!parts.current) {
    const rng = mulberry32(1234);
    const PAL = { win:['#22C55E','#6C63FF','#F59E0B','#00D4AA','#ffffff','#34D399','#A78BFA','#EC4899'], loss:['#EF4444','#991B1B','#7F1D1D','#6B7B94'], draw:['#F59E0B','#FBBF24','#6B7B94','#dddddd','#ffffff'] };
    const pal = PAL[kind] || PAL.draw, n = kind==='win'?100:kind==='draw'?35:20;
    const ups=[], grav=[];
    for (let i=0;i<n;i++){ const dur=600+rng()*500; ups.push({size:5+rng()*9,dx:(rng()-0.5)*300,dy:-(100+rng()*240),dur,delay:rng()*100,col:pal[i%pal.length],sq:rng()>0.4}); grav.push({size:5+rng()*9,dx:(rng()-0.5)*220,dy:120+rng()*200,dur:550+rng()*450,delay:dur*0.6+rng()*200,x0:(30+rng()*40)/100,y0:(10+rng()*20)/100,col:pal[i%pal.length],sq:rng()>0.4}); }
    parts.current={ups,grav};
  }
  const [t,setT]=useState(0);
  useEffect(()=>{ let raf,start=Date.now(); const loop=()=>{ const e=Date.now()-start; setT(e); if(e<2600) raf=requestAnimationFrame(loop); }; raf=requestAnimationFrame(loop); return ()=>cancelAnimationFrame(raf); },[]);
  const { Canvas, Circle, Rect } = SK;
  const cx=w/2, upY=h*0.55, ringY=h*0.5;
  const eo=p=>1-Math.pow(1-p,1.9), ei=p=>p*p;
  const els=[];
  const ringDefs = kind==='win'?[[0,'#22C55E'],[100,'#6C63FF'],[200,'#F59E0B']]:kind==='draw'?[[0,'#F59E0B']]:[[0,'#EF4444']];
  ringDefs.forEach(([d,c],idx)=>{ const e=t-d; if(e>0&&e<700){ const p=e/700,ep=eo(p),scale=0.1+2.9*ep; els.push(<Circle key={'r'+idx} cx={cx} cy={ringY} r={30*scale} color={c+ah(0.85*(1-p))} style="stroke" strokeWidth={3.6*scale} />); } });
  parts.current.ups.forEach((u,i)=>{ const e=t-u.delay; if(e<=0)return; const p=Math.min(e/u.dur,1),ep=eo(p); const op=p<=0.6?1:Math.max(0,1-(p-0.6)/0.4); if(op<=0)return; const sc=1+(0.3-1)*ep,x=cx+u.dx*ep,y=upY+u.dy*ep,ww=u.size*sc,hh=u.size*0.6*sc; els.push(u.sq?<Rect key={'u'+i} x={x-ww/2} y={y-hh/2} width={ww} height={hh} color={u.col+ah(op)} />:<Circle key={'u'+i} cx={x} cy={y} r={ww/2} color={u.col+ah(op)} />); });
  parts.current.grav.forEach((g,i)=>{ const e=t-g.delay; if(e<=0)return; const p=Math.min(e/g.dur,1),ep=ei(p),op=Math.max(0,1-p); if(op<=0)return; const x=g.x0*w+g.dx*ep,y=g.y0*h+g.dy*ep,ww=g.size,hh=g.size*0.6; els.push(g.sq?<Rect key={'g'+i} x={x-ww/2} y={y-hh/2} width={ww} height={hh} color={g.col+ah(op)} />:<Circle key={'g'+i} cx={x} cy={y} r={ww/2} color={g.col+ah(op)} />); });
  return <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">{els}</Canvas>;
}
function Shockwave({ color, delay=0 }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:700,delay,useNativeDriver:true}).start(); }, []);
  const scale = t.interpolate({inputRange:[0,1],outputRange:[0.1,5]}), opacity = t.interpolate({inputRange:[0,1],outputRange:[0.8,0]});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', top:'50%', left:'50%', width:60, height:60, marginLeft:-30, marginTop:-30, borderRadius:30, borderWidth:3, borderColor:color, opacity, transform:[{scale}] }} />;
}
function Flash({ color, delay=0 }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.sequence([Animated.delay(delay),Animated.timing(t,{toValue:1,duration:1,useNativeDriver:true}),Animated.timing(t,{toValue:0,duration:500,useNativeDriver:true})]).start(); }, []);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{ backgroundColor:color, opacity:t }]} />;
}
function RedPulse() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:800,useNativeDriver:true}).start(); }, []);
  const scale = t.interpolate({inputRange:[0,0.25,1],outputRange:[0.3,1,2]}), opacity = t.interpolate({inputRange:[0,0.25,1],outputRange:[0,1,0]});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', top:'50%', left:'50%', width:460, height:460, marginLeft:-230, marginTop:-230, borderRadius:230, backgroundColor:'rgba(239,68,68,0.28)', opacity, transform:[{scale}] }} />;
}
function WrongStamp() {
  // web .cr-wrong-stamp: transition 0.25s cubic-bezier(0.34,1.56,0.64,1); scale 3->1 at fixed -12deg; opacity 0->0.9; 60px
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a,{toValue:1,duration:250,easing:Easing.bezier(0.34,1.56,0.64,1),useNativeDriver:true}).start(); hap(Haptics.ImpactFeedbackStyle.Medium); }, []);
  const scale = a.interpolate({inputRange:[0,1],outputRange:[3,1]});
  const opacity = a.interpolate({inputRange:[0,1],outputRange:[0,0.9]});
  return <Animated.Text pointerEvents="none" style={{ position:'absolute', alignSelf:'center', top:0, fontSize:60, color:C.lose, fontFamily:F.k, opacity, transform:[{scale},{rotate:'-12deg'}] }}>✕</Animated.Text>;
}
function Countdown({ onDone }) {
  // web @keyframes countPulse: scale 1.8 -> 1 (50%) -> 0.95; opacity 0 -> 1 -> 1; 0.8s ease-out; 800ms per count
  const [n, setN] = useState(3); const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cur = 3; const pulse = () => { t.setValue(0); Animated.timing(t,{toValue:1,duration:800,easing:Easing.out(Easing.ease),useNativeDriver:true}).start(); };
    pulse();
    const tick = () => { cur--; if (cur>0){ setN(cur); pulse(); timer = setTimeout(tick,800); } else { onDone(); } };
    let timer = setTimeout(tick,800); return () => clearTimeout(timer);
  }, []);
  const scale = t.interpolate({inputRange:[0,0.5,1],outputRange:[1.8,1,0.95]});
  const opacity = t.interpolate({inputRange:[0,0.5,1],outputRange:[0,1,1]});
  return (<View style={[StyleSheet.absoluteFill,{ zIndex:200 }]}>
    <View style={{ flex:1, backgroundColor:'#fff', alignItems:'center', justifyContent:'center' }}>
      <Animated.Text style={{ fontSize:120, fontFamily:F.b, color:C.accent, opacity, transform:[{scale}], textShadowColor:'rgba(108,99,255,0.25)', textShadowRadius:40 }}>{n}</Animated.Text>
      <Text style={{ fontSize:18, color:C.text2, fontFamily:F.m, letterSpacing:2, marginTop:16, textTransform:'uppercase' }}>Get Ready</Text>
    </View>
  </View>);
}

function TimeRace({ myT, oppT, oppName, onDone }) {
  const myS = myT/1000, oppS = oppT/1000, maxS = Math.max(myS, oppS, 0.01);
  const same = myS === oppS, myWin = myS < oppS;
  const [t1, setT1] = useState(0); const [t2, setT2] = useState(0); const [gap, setGap] = useState(''); const [done, setDone] = useState(false);
  const w1 = useRef(new Animated.Value(0)).current, w2 = useRef(new Animated.Value(0)).current;
  const sx = useRef(new Animated.Value(0)).current, sy = useRef(new Animated.Value(0)).current, srot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w1,{toValue:myS/maxS,duration:2000,useNativeDriver:false}).start();
    Animated.timing(w2,{toValue:oppS/maxS,duration:2000,useNativeDriver:false}).start();
    const dur=2000, stp=25; let el=0; let gShown=false;
    const iv = setInterval(() => {
      el += stp; const p = Math.min(el/dur,1); const dm = maxS*p*1.1;
      const c1 = Math.min(dm,myS), c2 = Math.min(dm,oppS); setT1(c1); setT2(c2);
      if (!gShown) { // reveal gap the instant the faster side locks while the other still climbs
        if (c1 >= myS && c2 < oppS) { setGap(same?'EXACT SAME TIME':`+${(oppS-myS).toFixed(2)}s gap`); gShown=true; hap(Haptics.ImpactFeedbackStyle.Light); }
        else if (c2 >= oppS && c1 < myS) { setGap(`+${(myS-oppS).toFixed(2)}s gap`); gShown=true; hap(Haptics.ImpactFeedbackStyle.Light); }
      }
      // web-match shake: random jitter, intensity builds 2->14 across the race; x + 0.4*y + 0.08*deg rotation
      const intensity = 2 + Math.pow(p,1.5)*12;
      sx.setValue((Math.random()-0.5)*intensity); sy.setValue((Math.random()-0.5)*intensity*0.4); srot.setValue((Math.random()-0.5)*intensity*0.08);
      if (p>0.7 && el%50===0) hap(Haptics.ImpactFeedbackStyle.Light);
      if (el>=dur) { clearInterval(iv); sx.setValue(0); sy.setValue(0); srot.setValue(0); setT1(myS); setT2(oppS); if(same) setGap('EXACT SAME TIME'); setDone(true); hap(Haptics.ImpactFeedbackStyle.Heavy); setTimeout(onDone,700); }
    }, stp);
    return () => clearInterval(iv);
  }, []);
  const rotI = srot.interpolate({inputRange:[-360,360],outputRange:['-360deg','360deg']});
  const c1col = done ? (same?C.draw:(myWin?C.win:C.text2)) : C.text;
  const c2col = done ? (same?C.draw:(!myWin?C.win:C.text2)) : C.text;
  return (
    <Animated.View style={{ flex:1, justifyContent:'center', transform:[{translateX:sx},{translateY:sy},{rotate:rotI}] }}>
      <Text style={st.raceLabel}>{same?'COMPARING TIMES...':'WHO WAS FASTER?'}</Text>
      <View style={st.raceTimes}>
        <View style={{alignItems:'center',flex:1}}><Text style={st.raceName}>YOU</Text><Text style={[st.raceNum,{color:c1col}]}>{t1.toFixed(2)}s</Text></View>
        <Text style={st.raceVs}>vs</Text>
        <View style={{alignItems:'center',flex:1}}><Text style={st.raceName} numberOfLines={1}>{(oppName||'RIVAL').toUpperCase()}</Text><Text style={[st.raceNum,{color:c2col}]}>{t2.toFixed(2)}s</Text></View>
      </View>
      <View style={st.barRow}>
        <View style={st.barTrack}><Animated.View style={[st.barFillR,{backgroundColor:done?(myWin?C.win:C.accent):C.accent, width:w1.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]} /></View>
        <View style={st.barTrack}><Animated.View style={[st.barFillL,{backgroundColor:done?((!myWin&&!same)?C.win:C.lose):C.lose, width:w2.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]} /></View>
      </View>
      {gap ? <Text style={[st.gap, same&&{color:C.draw}]}>{gap}</Text> : null}
    </Animated.View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
    Inter_900Black: require('./assets/fonts/Inter_900Black.ttf'),
  });
  const [tab, setTab] = useState('home');
  const [mode, setMode] = useState(null);
  const [countdown, setCountdown] = useState(false);
  const [rec, setRec] = useState({ wins:0, losses:0, draws:0 });
  const [sound, setSound] = useState(true); // 1c (2026-07-10): sound DEFAULT ON
  const [q, setQ] = useState(null);
  const [used, setUsed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [comp, setComp] = useState(null);
  const [oppName, setOppName] = useState('Rival');
  const [online, setOnline] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [myTime, setMyTime] = useState(null);
  const [notice, setNotice] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastKind, setToastKind] = useState('info'); // 'info' | 'error' — reskin toast tint (old UI ignores)
  // online/challenge parity state
  const [onlineRec, setOnlineRec] = useState({ wins:0, losses:0, draws:0 });
  const [matchLog, setMatchLog] = useState([]);      // settled online/challenge matches
  const [pending, setPending] = useState({});         // matchId -> {opponent, myTime, ts}
  const pendingRef = useRef({}); useEffect(() => { pendingRef.current = pending; }, [pending]); // mirror for timers (push-ask guard)
  const [pracLog, setPracLog] = useState([]);          // last 10 practice rounds {result, animal, time}
  const [wsUp, setWsUp] = useState(true);              // B42: socket truth for waiting screens (true until proven dead)
  useEffect(() => { onConnState(setWsUp); return () => onConnState(null); }, []);
  const [pushOn, setPushOn] = useState(true);          /* B35: notification permission state. Defaults true so the waiting-screen button never flashes before the first check resolves; 'unsupported' (Android/Expo Go) also hides the button. */
  const [banners, setBanners] = useState([]);         // background-result notifications
  const [showActions, setShowActions] = useState(false); // play-screen Play Again/History/Home
  const [challenge, setChallenge] = useState(null);   // challengeService snapshot
  const [joinCode, setJoinCode] = useState('');
  // ===== credits / stakes (stubbed local balance adapter — swap for server+processor to go real-money) =====
  const [balance, setBalance] = useState(500);   // free starting credits
  const balanceRef = useRef(500);                 // mirror for WS handlers (closures can't read state fresh)
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  // AUDIT #4 (2026-07-02): snapshot of the balance at the instant a result arrives —
  // taken BEFORE the settle's hydrateHistory can apply the payout. The results odometer
  // animates from this frozen number instead of live-math against g.balance (which races
  // the async balance fetch and could show a wrong before/after).
  const resultBalBeforeRef = useRef(null);
  const [stake, setStake] = useState(10);         // selected entry credits
  const [ledger, setLedger] = useState([]);       // [{ts,type,amount,label}]
  const [serverLedger, setServerLedger] = useState([]); // server credit_ledger rows (source of truth when signed in)
  const [confirming, setConfirming] = useState(false);
  const stakeRef = useRef(10);
  const [rematchReq, setRematchReq] = useState(false);
  // Supabase email/OTP login (optional upgrade over the anonymous device account)
  const [authEmail, setAuthEmail] = useState(null);
  const [authSince, setAuthSince] = useState(null);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [signinEmail, setSigninEmail] = useState('');
  const [signinCode, setSigninCode] = useState('');
  const [signinStep, setSigninStep] = useState('email'); // 'email' | 'code'
  const [signinBusy, setSigninBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const history = useRef([]); const startRef = useRef(0); const timerRef = useRef(null); const answered = useRef(false);
  // TIMING FIX 2 rev3 (2026-06-12): t0 anchored to the rendered HANDOFF frame
  // (2400ms — the moment the question appears). The reskin countdown reports it
  // (CountdownScreen onHandoff, the 2400ms handoff frame) into this override; the round-start effect
  // consumes it (fresh within 1s) instead of its own Date.now(). Fallback: if
  // it never reports (old UI / edge), the scheduled flip's Date.now() is t0,
  // exactly as before. Server contract unaffected: clientTime is still ms
  // since countdown-end, and the server clamps it to [100ms, 10s] regardless.
  const startOverrideRef = useRef(null);
  const imgMsRef = useRef(null); // #50: ms from question receipt to image prefetch done (null = not measured)
  const onlineRef = useRef(false); const matchIdRef = useRef(null); const pickedRef = useRef(null); const myTimeRef = useRef(null);
  const questionIdxRef = useRef(null); // bank index of the active online question (additive 2026-06-16, for history thumbnails)
  // CANCEL pass (2026-06-16): matchIds this client has locally cancelled. Used to SUPPRESS a
  // stray late async-result/banner for a match the player believes is cancelled (symptom F),
  // and to ignore any re-hydrate that would re-add a just-cancelled card before the server's
  // status flip has propagated. Capped so it can't grow unbounded.
  const cancelledIdsRef = useRef(new Set());
  function markCancelledId(mid) { if (!mid) return; const s = cancelledIdsRef.current; s.add(mid); if (s.size > 50) { const it = s.values(); s.delete(it.next().value); } }
  // HIGH-1 GUARD: cap AUTO requeues so the server replying 'match-unavailable' repeatedly (a
  // transient orphan) can never trap the player in an endless re-queue/replay loop. Manual
  // replays (RUN IT BACK / swipe-up) are intentionally NOT guarded. Resets on a real question.
  const autoRequeueRef = useRef({ n: 0, t: 0 });
  const gpsRetryRef = useRef(0);        // GPS gate (2026-07-15): one re-queue per PLAY tap, no loops
  const isChallengeRef = useRef(false); const activeMatchRef = useRef(null); const pendTimer = useRef(null); const modeRef = useRef(null);
  const wsHandlerRef = useRef(() => {}); const myNameRef = useRef(null); const showActionsRef = useRef(false); const toastTimer = useRef(null);
  const accountRef = useRef(null); const pendingAfterReg = useRef(null); // device-bound account {accountId,handle,token}
  const supabaseTokenRef = useRef(null); // Supabase access token when signed in (preferred over device token)
  const fade = useRef(new Animated.Value(1)).current;
  // swipe-up on the Play screen (when pending actions are showing) → re-queue, matching web
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) => showActionsRef.current && g.dy < -16,
    onPanResponderRelease: (e, g) => { if (showActionsRef.current && g.dy < -60) { setShowActions(false); requeueOnline(); } },
  })).current;

  // Persist practice stats (web saves to localStorage; mobile uses AsyncStorage)
  useEffect(() => { (async () => { try { const r = await AsyncStorage.getItem('sense_rec'); if (r) setRec(JSON.parse(r)); const h = await AsyncStorage.getItem('sense_hist'); if (h) history.current = JSON.parse(h); const pl = await AsyncStorage.getItem('sense_praclog'); if (pl) setPracLog(JSON.parse(pl)); const o = await AsyncStorage.getItem('sense_orec'); if (o) setOnlineRec(JSON.parse(o)); let hn = await AsyncStorage.getItem('sense_handle'); if (!hn) { hn = generatePlayerName() + '#' + Math.floor(100 + Math.random() * 900); AsyncStorage.setItem('sense_handle', hn); } myNameRef.current = hn; const acct = await AsyncStorage.getItem('sense_account'); if (acct) { accountRef.current = JSON.parse(acct); if (accountRef.current && accountRef.current.handle) myNameRef.current = accountRef.current.handle; } try { setDisplayName(myNameRef.current || ''); hydrateHistory(myNameRef.current); hydrateOpenGames(myNameRef.current); } catch (e) {} try { const bal = await AsyncStorage.getItem('sense_balance'); if (bal != null) setBalance(parseInt(bal) || 0); const lg = await AsyncStorage.getItem('sense_ledger'); if (lg) setLedger(JSON.parse(lg)); } catch (e) {} } catch (e) {} })(); }, []);
  useEffect(() => { try { AsyncStorage.setItem('sense_rec', JSON.stringify(rec)); } catch (e) {} }, [rec]);
  useEffect(() => { try { AsyncStorage.setItem('sense_orec', JSON.stringify(onlineRec)); } catch (e) {} }, [onlineRec]);
  useEffect(() => onChallengeChange(setChallenge), []);
  /* B35: keep pushOn in sync with the real iOS permission. Checked on mount and every
     return to foreground — the only way the value changes while we're running is the user
     flipping it in iOS Settings (or granting via our prompt, which openSettings round-trips
     also catch since the permission alert itself fires an active transition). */
  useEffect(() => {
    const refresh = () => { getPushStatus().then((st) => setPushOn(st !== 'undetermined' && st !== 'denied')).catch(() => {}); };
    refresh();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => { try { sub.remove(); } catch (e) {} };
  }, []);
  useEffect(() => { initSfx(); initAnalytics(); track('app_open'); /* P2: attest once per install + silent push-token refresh */ setTimeout(() => { try { runAttestation(HTTPS_BASE, authTok); ensurePushRegistration(HTTPS_BASE, authTok, { askIfNeeded: false }); } catch (e) {} }, 3000); try { if (Platform.OS !== 'web' && global.ErrorUtils && global.ErrorUtils.getGlobalHandler) { const _p = global.ErrorUtils.getGlobalHandler(); global.ErrorUtils.setGlobalHandler((e, fatal) => { captureError(e, { fatal }); if (_p) _p(e, fatal); }); } } catch (e) {} (async () => { try { const sv = await AsyncStorage.getItem('sense_sound2'); if (sv != null) setSound(sv === '1'); } catch (e) {} })(); }, []);
  useEffect(() => { soundOn = sound; setSfxEnabled(sound); AsyncStorage.setItem('sense_sound2', sound ? '1' : '0').catch(() => {}); }, [sound]); // setSfxEnabled: reskin SFX rides the same toggle. 1c (2026-07-10): key is sense_sound2 — legacy sense_sound was auto-written '0' on every install, reading it would keep everyone muted despite the new default-ON
  // BUG 2 FIX (2026-06-16): opening History (or Home) now also reconciles the PENDING map
  // against the server's open list, so a stale 'WAITING' card for an already-settled match
  // (async-result missed while disconnected) drops live without a manual refresh, and the
  // '1 MATCH PENDING' strip reflects the true server open-game count.
  useEffect(() => { if (tab === 'history' || tab === 'home') { hydrateHistory(myName()); hydrateOpenGames(myName()); } }, [tab]);
  useEffect(() => {
    let sub;
    (async () => {
      try { const { data } = await supabase.auth.getSession(); const s = data && data.session; if (s) { supabaseTokenRef.current = s.access_token; setAuthEmail(s.user && s.user.email); setAuthSince(s.user && s.user.created_at); syncAccount(); } } catch (e) {}
      try { sub = supabase.auth.onAuthStateChange((_e, s) => { supabaseTokenRef.current = s ? s.access_token : null; setAuthEmail(s && s.user ? s.user.email : null); setAuthSince(s && s.user ? s.user.created_at : null); if (s) syncAccount(); }); } catch (e) {}
    })();
    return () => { try { sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe(); } catch (e) {} };
  }, []);

  function fadeTo(next) { Animated.timing(fade,{toValue:0,duration:120,useNativeDriver:true}).start(); setTimeout(()=>{ next(); fade.setValue(0); Animated.timing(fade,{toValue:1,duration:150,useNativeDriver:true}).start(); },130); }

  useEffect(() => {
    if (mode !== 'play' || !q || countdown) return;
    const ov = startOverrideRef.current; startOverrideRef.current = null;
    answered.current = false; startRef.current = (ov && Math.abs(Date.now() - ov) < 1000) ? ov : Date.now(); setElapsed(0);
    timerRef.current = setInterval(() => { const e = Date.now()-startRef.current; setElapsed(e); if (e>=TIME_LIMIT){ clearInterval(timerRef.current); submit(-1); } }, 50);
    return () => clearInterval(timerRef.current);
  }, [q, mode, countdown]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location || !/[?&]test/.test(window.location.search || '')) return;
    window.__sense = (pp = {}) => {
      const qq = q || getPracticeQuestion([]);
      const ci = qq.correctIdx, wrong = (ci + 1) % qq.options.length;
      const picked = pp.myCorrect ? ci : (pp.myTimeout ? -1 : wrong);
      setQ(qq); setPicked(picked);
      setComp({ answer: pp.oppCorrect ? ci : wrong, time: pp.oppTime ?? 1500, isCorrect: !!pp.oppCorrect, playerTime: pp.myTimeout ? TIME_LIMIT : (pp.myTime ?? 1200), correctIdx: ci });
      setResult({ result: pp.result || 'win', reason: '' });
      setOppName(generatePlayerName());
      setCountdown(false); setMode('results');
    };
  }, [q]);

  function recordUsed(idx) { setUsed(u => { const n = [...u, idx]; return n.length > 15 ? n.slice(-10) : n; }); }
  function startRound(f) { onlineRef.current = false; isChallengeRef.current = false; setOnline(false); setMyTime(null); setShowActions(false); setOppName(generatePlayerName()); try { Image.prefetch(f.image); } catch(e){} setQ(f); setPicked(null); setResult(null); setComp(null); setCountdown(true); fadeTo(() => setMode('play')); }
  function startPractice() { track('practice_start'); const f = getPracticeQuestion(used); recordUsed(f.questionIdx); startRound(f); }
  // TIMING FIX 2 (2026-06-12): optional pressTs = Date.now() captured at
  // TOUCH-DOWN (AnswerGrid onPressIn). clientTime is computed from the moment
  // the finger made contact, not from when the press gesture completed —
  // removes the ~50-120ms touch-up latency from the scored time. Sanity-gated:
  // pressTs must sit inside [t0, now] or we fall back to Date.now() (old path,
  // also what practice/old-UI callers without pressTs get).
  function submit(idx, pressTs) {
    if (answered.current) return; answered.current = true; clearInterval(timerRef.current);
    const tAns = (pressTs && pressTs >= startRef.current && pressTs <= Date.now()) ? pressTs : Date.now();
    const playerTime = idx === -1 ? TIME_LIMIT : Math.max(0, Math.min(tAns-startRef.current, TIME_LIMIT));
    setPicked(idx); setMyTime(playerTime); playSfx('tap');
    if (onlineRef.current) {
      // Online: the server decides the result. Send our LOCAL time; wait for the result message.
      pickedRef.current = idx; myTimeRef.current = playerTime;
      if (isChallengeRef.current) {
        wsSend(roomAnswer(idx, Math.round(playerTime)));   // challenge ROOM engine
      } else {
        // AUDIT FIX #2: plain wsSend silently DROPS on a closed socket (answer lost -> timeout loss).
        // Freeze the message now, then reconnect-if-needed and send; identity lets the server verify us on the fresh socket.
        { const ansMsg = asyncAnswer(matchIdRef.current, idx, Math.round(playerTime), wsIdentity(), imgMsRef.current); ensureConn(() => wsSend(ansMsg)); }  // async matchmaking (#50: imgMs rides along, null omitted)
        const mid = matchIdRef.current;
        // questionIdx carried so the PENDING card (and later the settled card) can show the question-image thumbnail
        setPending(p => ({ ...p, [mid]: { opponent: oppName || 'Searching…', myTime: Math.round(playerTime), ts: Date.now(), createdAt: Date.now(), stake: stakeRef.current, questionIdx: questionIdxRef.current } }));
        if (pendTimer.current) clearTimeout(pendTimer.current);
        pendTimer.current = setTimeout(() => { if (onlineRef.current) setShowActions(true); }, 4000); // web: actions appear at +4s
        setTimeout(() => { try { if (pendingRef.current[mid]) ensurePushRegistration(HTTPS_BASE, authTok, { askIfNeeded: true }); } catch (e) {} }, 2000); // P2 ask moment (CJ 2026-07-11): 2s after submit, ONLY if the match hasn't already settled — an instant result makes the ask pointless
      }
      return;
    }
    const c = getComputerAnswer(q.correctIdx, q.options.length, history.current);
    const r = determinePracticeResult(idx, playerTime, c.answer, c.time, q.correctIdx);
    setComp({ ...c, playerTime }); setResult(r);
    history.current = [...history.current, r.result === 'win'];
    try { AsyncStorage.setItem('sense_hist', JSON.stringify(history.current)); } catch (e) {}
    setRec(p => ({ wins:p.wins+(r.result==='win'), losses:p.losses+(r.result==='loss'), draws:p.draws+(r.result==='draw') }));
    setPracLog(p => { const n = [{ result: r.result, animal: q.options[q.correctIdx], time: playerTime }, ...p].slice(0, 10); try { AsyncStorage.setItem('sense_praclog', JSON.stringify(n)); } catch (e) {} return n; });
    setTimeout(() => fadeTo(() => setMode('results')), 800);
  }
  function playAgain() {
    if (isChallengeRef.current) { doRematch(); return; }
    if (onlineRef.current) { requeueOnline(); return; }
    const f = getPracticeQuestion(used); recordUsed(f.questionIdx); startRound(f);
  }
  function goHome() {
    if (onlineRef.current || isChallengeRef.current) { try { disconnectWS(); } catch(e){} }
    onlineRef.current = false; isChallengeRef.current = false; setOnline(false); setShowActions(false); closeChallenge();
    activeMatchRef.current = null; matchIdRef.current = null; // BUG 2 FIX: drop the foreground match so late dup events for a left match can't re-foreground/bounce
    fadeTo(() => { setMode(null); setTab('home'); });
  }

  // ===== ONLINE (live server — reuses the same Play + Results screens) =====
  function myName() { if (!myNameRef.current) myNameRef.current = generatePlayerName() + '#' + Math.floor(100 + Math.random() * 900); return myNameRef.current; }
  function showToast(m, kind) { setToast(m); setToastKind(kind === 'error' ? 'error' : 'info'); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3000); } // 3s transient (matches web)
  function bailHome(msg) { setNotice(msg || null); try { disconnectWS(); } catch (e) {} onlineRef.current = false; isChallengeRef.current = false; setOnline(false); matchIdRef.current = null; activeMatchRef.current = null; /* BUG 2 FIX: clear the foreground match too */ fadeTo(() => { setMode(null); setTab('home'); }); }
  // shared: load the incoming question onto the (reused) Play screen
  function loadQuestion(mid, question) {
    const img = HTTPS_BASE + '/img/' + question.imageToken;
    // #50: time the image download (receipt -> prefetch resolved) and report it with the
    // answer so the server can tell slow downloads from time-shaving. Guarded by matchId:
    // a late resolve from a previous match must not pollute this one. Failure => null (no claim).
    imgMsRef.current = null;
    const qReceivedAt = Date.now();
    // Ready-gate (B39): the round now starts when the image is READY, not when the
    // question arrives. begin() tells the server "my round starts NOW" ({type:'ready'}
    // — it re-anchors our clock at receipt so download time can't count against us),
    // then runs the countdown. Fire-and-forget: never waits for a reply; a dropped
    // ready just means the server keeps the old (question-sent) anchor. Runs exactly
    // once — on prefetch resolve, prefetch failure, or the 3s cap, whichever is first
    // (cap < server's 4s READY_DEADLINE so a capped ready still lands in the window).
    // Challenge rooms ('room') keep the old immediate start — the room engine drives
    // their timing, not the async queue.
    let began = false;
    const begin = () => {
      if (began || matchIdRef.current !== mid) return; // stale callback from an old match must not start/ready this one
      began = true;
      if (mid !== 'room') { try { wsSend({ type: 'ready', matchId: mid, name: myName() }); } catch (e) {} }
      setCountdown(true); fadeTo(() => setMode('play'));
    };
    try { Image.prefetch(img).then(() => { if (matchIdRef.current === mid && imgMsRef.current == null) imgMsRef.current = Date.now() - qReceivedAt; begin(); }).catch(begin); } catch (e) {}
    activeMatchRef.current = mid; matchIdRef.current = mid; pickedRef.current = null; myTimeRef.current = null;
    setMatchId(mid);
    // questionIdx (additive 2026-06-16): the server now sends the bank index with
    // the question; we keep it so the pending + settled history cards can resolve
    // a stable question-image thumbnail from the bundled questions bank.
    questionIdxRef.current = (question.questionIdx != null ? question.questionIdx : null);
    setQ({ text: question.text, image: img, options: question.options, correctIdx: null, questionIdx: questionIdxRef.current });
    setPicked(null); setResult(null); setComp(null); setMyTime(null); setShowActions(false);
    if (mid === 'room') begin(); else setTimeout(begin, 3000); // countdown start moved into begin() (ready-gate B39)
  }
  // shared: record a settled online/challenge match + bump online stats + clear pending
  function logMatch(mid, res, reason, myT, oppT, correctIdx, oppNm, stk, qIdx) {
    track('match_result', { result: res, stake: stk || 0, reason });
    setOnlineRec(p => ({ wins:p.wins+(res==='win'), losses:p.losses+(res==='loss'), draws:p.draws+(res==='draw') }));
    // qIdx (additive 2026-06-16): the question's bank index, so the settled history
    // card resolves a thumbnail. Caller passes the pending entry's value; falls back
    // to the active question's ref for the foreground match.
    const questionIdx = (qIdx != null ? qIdx : questionIdxRef.current);
    setMatchLog(prev => [{ matchId:mid, opponent:oppNm, result:res, myTime:myT, oppTime:oppT, correctIdx, reason, stake:stk||0, questionIdx, timestamp:new Date().toISOString() }, ...prev].slice(0,50));
    // credit settlement (stake was escrowed at entry): win => pot*(1-5% rake); draw => refund; loss => already paid
    const sV = stk || 0;
    if (sV > 0) {
      if (res === 'win') { const w = Math.round(sV * 2 * 0.95); applyCredit(w, 'win', 'Won ' + w); }
      else if (res === 'draw') { applyCredit(sV, 'refund', 'Draw refund ' + sV); }
    }
    setPending(p => { const n = { ...p }; delete n[mid]; return n; });
  }
  // shared: map a server result into the practice-shaped state and show the Results screen
  function showResultsFor(msg, oppT) {
    resultBalBeforeRef.current = onlineRef.current ? balanceRef.current : null; // AUDIT #4: freeze pre-payout balance
    const yt = myTimeRef.current;
    // Free online sends R_official as you.serverTime (the number that DECIDED the game) — show that
    // so the results card can't contradict the outcome. Practice/room have no serverTime -> local time.
    const myShown = (msg.you && msg.you.serverTime != null) ? msg.you.serverTime : (yt != null ? yt : TIME_LIMIT);
    setComp({ answer: msg.opponent.answer, time: oppT, isCorrect: msg.opponent.answer === msg.correctIdx, playerTime: myShown, correctIdx: msg.correctIdx });
    setResult({ result: msg.you.result, reason: msg.reason });
    setQ(prev => prev ? { ...prev, correctIdx: msg.correctIdx } : prev);
    setShowActions(false);
    setTimeout(() => fadeTo(() => setMode('results')), 1200);
  }
  function pushBanner(res, oppNm, mid) {
    const id = Date.now() + '-' + mid, word = res==='win'?'Won':res==='loss'?'Lost':'Draw';
    // BUG 2 FIX (2026-06-13): a backlog of background results used to stack one full-width
    // banner PER match with no cap/dedup, covering the screen and blocking the Home/nav
    // taps underneath. Collapse to ONE banner per match (replace any existing one for the
    // same mid) and keep at most the 3 most recent so the UI under them stays reachable.
    setBanners(prev => [...prev.filter(b => b.mid !== mid), { id, result:res, text:`${word} vs ${oppNm}`, mid }].slice(-3));
    setTimeout(() => setBanners(prev => prev.filter(b => b.id !== id)), 4000);
  }
  async function hydrateHistory(name) {
    if (!name) return;
    try {
      const tok = (supabaseTokenRef.current) || (accountRef.current && accountRef.current.token) || '';
      const r = await fetch(`${HTTPS_BASE}/history/${encodeURIComponent(name)}?limit=200${tok ? '&token=' + encodeURIComponent(tok) : ''}`);
      const d = await r.json();
      if (d && Array.isArray(d.matches)) {
        const mapped = d.matches.filter(m => m.mode === 'free').map(m => { const meA = m.player_a === name; return { matchId: m.match_id, opponent: meA ? m.player_b : m.player_a, result: meA ? m.result_a : m.result_b, myTime: meA ? m.time_a : m.time_b, oppTime: meA ? m.time_b : m.time_a, correctIdx: m.correct_idx, questionIdx: (m.question_idx != null ? m.question_idx : null), reason: m.reason, timestamp: m.settled_at }; }).filter(x => x.matchId);
        setMatchLog(prev => { const ids = new Set(mapped.map(x => x.matchId)); const localOnly = prev.filter(x => !ids.has(x.matchId)); return [...localOnly, ...mapped].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0,200); });
        if (d.free && typeof d.free.wins === 'number') setOnlineRec({ wins: d.free.wins||0, losses: d.free.losses||0, draws: d.free.draws||0 });
        if (Array.isArray(d.ledger)) setServerLedger(d.ledger);            // server-authoritative tx feed
        if (typeof d.balance === 'number') { setBalance(d.balance); AsyncStorage.setItem('sense_balance', String(d.balance)).catch(()=>{}); }
      }
    } catch (e) {}
  }
  async function hydrateOpenGames(name) {
    if (!name) return;
    try {
      const tok = (supabaseTokenRef.current) || (accountRef.current && accountRef.current.token) || '';
      const r = await fetch(`${HTTPS_BASE}/api/open-games/${encodeURIComponent(name)}${tok ? '?token=' + encodeURIComponent(tok) : ''}`);
      const d = await r.json();
      // BUG 2 FIX (2026-06-16): reconcile pending to EXACTLY the server's open list.
      // Was gated on `d.open.length` so an EMPTY open list (everything settled — the
      // stale-PENDING-card case) skipped the drop pass entirely and the card lingered.
      // Now runs whenever `d.open` is an array (incl. []), so a settled match that the
      // app missed the async-result for (creator was offline when the opponent matched)
      // is dropped the moment we hydrate. Server /api/open-games returns only status='open'.
      if (d && Array.isArray(d.open)) {
        const open = d.open;
        setPending(prev => {
          const next = { ...prev };
          const seen = new Set();
          open.forEach(g => {
            if (!g.match_id) return;
            // CANCEL pass: never re-add a card the player just cancelled (status flip may still be
            // propagating so the server can briefly still list it as open). cancelledIdsRef guards it.
            if (cancelledIdsRef.current.has(g.match_id)) return;
            seen.add(g.match_id);
            const cAt = g.created_at ? new Date(g.created_at).getTime() : null;
            const qIdx = (g.question_idx != null ? g.question_idx : null);
            // CANCEL pass (symptom 2 FIX): the server now returns the REAL stake (cents) and the
            // player's locked answer time on each open game, so a card REBUILT after an app reopen
            // shows "$0.50 / YOU LOCKED 1.18s" instead of the old "$0.00 / YOU LOCKED \u2014" placeholder.
            const stk = (g.stake_cents != null ? g.stake_cents : 0);
            const myT = (g.display_time_a != null ? g.display_time_a : (g.time_a != null ? g.time_a : null));
            if (!next[g.match_id]) {
              next[g.match_id] = { opponent: 'Searching\u2026', ts: cAt || Date.now(), createdAt: cAt, stake: stk, myTime: myT, questionIdx: qIdx };
            } else {
              // heal an already-rendered card in place: fill stake/myTime/questionIdx if missing.
              const cur = next[g.match_id];
              next[g.match_id] = {
                ...cur,
                ...(cAt ? { createdAt: cAt } : {}),
                stake: (cur.stake ? cur.stake : stk),
                myTime: (cur.myTime != null ? cur.myTime : myT),
                questionIdx: (cur.questionIdx != null ? cur.questionIdx : qIdx),
              };
            }
          });
          const DROP_GRACE_MS = 6000; let dropped = false; const nowTs = Date.now();
          Object.keys(next).forEach(mid => {
            // FIX(cancel-hang): fall back to `ts` when createdAt is missing. The old guard
            // (createdAt != null) made any card without createdAt IMMORTAL — it never dropped
            // even on refresh, so a missed terminal message left a pending card stuck forever.
            const _age = next[mid] ? (nowTs - (next[mid].createdAt != null ? next[mid].createdAt : (next[mid].ts || 0))) : Infinity;
            if (!seen.has(mid) && next[mid] && _age > DROP_GRACE_MS) { delete next[mid]; dropped = true; }
          });
          /* BUG 2 FIX (2026-06-13): reconcile SILENTLY. This poll fired one 'MATCH EXPIRED' toast per
             disappeared open game (spam with a backlog) and mis-labelled SETTLED games as 'expired'.
             The authoritative toast/banner now comes only from game-expired / async-result handlers. */
          if (dropped) setTimeout(() => { try { refreshServerBalance(); } catch (e) {} }, 0);
          return next;
        });
      }
    } catch (e) {}
  }
  function doRename(name) {
    const nm = String(name || '').trim();
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(nm)) { showToast('3-16 chars: letters, numbers, underscore'); return; }
    setNameBusy(true);
    const send = () => wsSend({ type: 'rename', handle: nm, token: (accountRef.current && accountRef.current.token) || undefined, supabaseToken: supabaseTokenRef.current || undefined });
    const go = () => { if (accountRef.current || supabaseTokenRef.current) send(); else { pendingAfterReg.current = send; wsSend({ type: 'register', preferredHandle: myName() }); } };
    if (isConnected()) go(); else ensureConn(go);
  }
  function handleOnlineMessage(msg) {
    switch (msg.type) {
      // ---- device-bound account ----
      case 'registered': {
        accountRef.current = { accountId: msg.accountId, handle: msg.handle, token: msg.token }; identify(msg.accountId, { handle: msg.handle });
        myNameRef.current = msg.handle; setDisplayName(msg.handle); hydrateHistory(msg.handle);
        try { AsyncStorage.setItem('sense_account', JSON.stringify(accountRef.current)); } catch (e) {}
        const fn = pendingAfterReg.current; pendingAfterReg.current = null; if (fn) fn(); // resume the queue we were starting
        break;
      }
      case 'account-synced': {
        if (msg.ok) {
          accountRef.current = { accountId: msg.accountId, handle: msg.handle, token: msg.token, supabase: true };
          myNameRef.current = msg.handle; setDisplayName(msg.handle); identify(msg.accountId, { handle: msg.handle, email: msg.email });
          try { AsyncStorage.setItem('sense_account', JSON.stringify(accountRef.current)); AsyncStorage.setItem('sense_handle', msg.handle); } catch (e) {}
          try { hydrateHistory(msg.handle); hydrateOpenGames(msg.handle); } catch (e) {}
        }
        break;
      }
      case 'rename-result': {
        setNameBusy(false);
        if (msg.ok) {
          myNameRef.current = msg.handle; setDisplayName(msg.handle); setEditingName(false); hydrateHistory(msg.handle); track('rename');
          if (msg.token) { accountRef.current = { ...(accountRef.current || {}), handle: msg.handle, token: msg.token }; try { AsyncStorage.setItem('sense_account', JSON.stringify(accountRef.current)); } catch (e) {} }
          try { AsyncStorage.setItem('sense_handle', msg.handle); } catch (e) {}
          showToast('Username saved');
        } else { showToast(msg.error || 'Could not save username'); }
        break;
      }
      // ---- async matchmaking ----
      case 'async-opponent-found': setOppName(msg.opponentName || 'Rival'); break;
      case 'async-question':
        // B43 GHOST GUARD: a question while we're NOT in online play means a stale/replayed
        // queue reached the server (any vector). Never hijack the screen — cancel for an
        // instant refund and stay put. Belt-and-suspenders on top of the websocket.js fix.
        if (!onlineRef.current) {
          try { markCancelledId(msg.matchId); wsSend(cancelMatch(msg.matchId, wsIdentity())); } catch (e) {}
          refreshServerBalance();
          break;
        }
        autoRequeueRef.current.n = 0; loadQuestion(msg.matchId, msg.question); refreshServerBalance(); break; // a real question = we matched; clear the auto-requeue guard. server escrowed the stake before sending the question.
      case 'answer-ack': break;     // local time already frozen on tap — ignore the server echo
      case 'async-waiting': break;  // we answered first; waiting on opponent
      case 'async-result': {
        const res = msg.you.result, oppT = (msg.opponent.serverTime != null ? msg.opponent.serverTime : msg.opponent.time);
        const oppNm = (msg.opponent && msg.opponent.name) || (pending[msg.matchId] && pending[msg.matchId].opponent) || oppName || 'Opponent';
        const myT = (pending[msg.matchId] && pending[msg.matchId].myTime != null) ? pending[msg.matchId].myTime : myTimeRef.current;
        // questionIdx from the pending entry so a BACKGROUND settlement (the active
        // ref may point at a different game by now) still records the right thumbnail.
        const qI = (pending[msg.matchId] && pending[msg.matchId].questionIdx != null) ? pending[msg.matchId].questionIdx : questionIdxRef.current;
        logMatch(msg.matchId, res, msg.reason, myT, oppT, msg.correctIdx, oppNm, (pending[msg.matchId] && pending[msg.matchId].stake) || stakeRef.current, qI);
        cancelledIdsRef.current.delete(msg.matchId); // it settled (race-loss: A was already told it went live) — stop suppressing
        // foreground only if this is the match currently on the Play screen — else a background banner
        if (activeMatchRef.current === msg.matchId && (modeRef.current === 'play' || modeRef.current === 'joining')) showResultsFor(msg, oppT);
        else pushBanner(res, oppNm, msg.matchId);
        refreshServerBalance();   // settle wrote win/refund/rake rows — sync balance + ledger feed
        setTimeout(() => { try { refreshServerBalance(); } catch (e) {} }, 4000); // AUDIT #4: retry — hydrateHistory swallows fetch failures, one late re-sync self-heals a missed payout
        reconcilePending();       // drop the now-settled card from PENDING / fix the strip count
        break;
      }
      // ---- challenge ROOM engine ----
      // AUDIT MED #6 (2026-07-02, CJ): friend-room mode is fully coded but has no UI entry and
      // won't ship for now — gated OFF behind CHALLENGE_ENABLED. Flip the flag to restore.
      case 'created': if (CHALLENGE_ENABLED) handleChallengeMessage(msg); break;
      case 'joined': if (CHALLENGE_ENABLED) handleChallengeMessage(msg); break;
      case 'opponent-joined': if (CHALLENGE_ENABLED) { handleChallengeMessage(msg); setOppName(msg.name || oppName); } break;
      case 'opponent-wants-rematch': if (CHALLENGE_ENABLED) handleChallengeMessage(msg); break;
      case 'opponent-disconnected': if (CHALLENGE_ENABLED) { handleChallengeMessage(msg); showToast('Opponent disconnected'); } break;
      case 'opponent-answered': break; // informational (matches web)
      case 'round-start': {
        if (!CHALLENGE_ENABLED) break;
        isChallengeRef.current = true; onlineRef.current = true; setOnline(true); setRematchReq(false);
        const cs = getChallenge();
        const oppNm = cs && (cs.role==='host' ? cs.joinerName : cs.hostName);
        if (oppNm) setOppName(oppNm);
        loadQuestion('room', msg.question);
        break;
      }
      case 'round-go': break; // informational — the 3-2-1 countdown drives timer start (matches web)
      case 'result': {        // challenge room result: opponent.time (no serverTime)
        if (!CHALLENGE_ENABLED) break;
        const res = msg.you.result, oppT = msg.opponent.time;
        const cs = getChallenge();
        const oppNm = (cs && (cs.role==='host' ? cs.joinerName : cs.hostName)) || oppName || 'Opponent';
        logMatch('room-'+Date.now(), res, msg.reason, myTimeRef.current, oppT, msg.correctIdx, oppNm, 0, questionIdxRef.current);
        setRematchReq(false);
        showResultsFor(msg, oppT);
        break;
      }
      // ---- shared ----
      case 'rtt-ping': wsSend(rttPong(msg.nonce)); break;
      case 'ping': wsSend(pong(msg.nonce)); break;   // room latency probe (web replies pong)
      case 'rtt-result': break;
      case 'match-cancelled':  // a pending async game was cancelled — refund the escrowed stake, drop the card
        if (msg.matchId) {
          const st0 = pending[msg.matchId] && pending[msg.matchId].stake; if (st0) applyCredit(st0, 'refund', 'Cancel refund ' + st0);
          setPending(p => { const n = { ...p }; delete n[msg.matchId]; return n; });
          // keep the id in cancelledIdsRef so a near-simultaneous /api/open-games hydrate (status
          // flip still propagating) can't re-add this card before the server reports it closed.
          markCancelledId(msg.matchId);
          // if A cancelled the match it's currently sitting on (in-game cancel), drop the foreground too
          if (activeMatchRef.current === msg.matchId) { activeMatchRef.current = null; matchIdRef.current = null; }
          refreshServerBalance();
        }
        break;
      case 'cancel-denied':  // 2-min anti-abuse lockout OR (matchStarted) the opponent joined first
        if (msg.matchStarted) {
          // The cancel lost the race — the match is now LIVE with an opponent. Stop suppressing its
          // result; it will arrive via async-result (foreground result if we're still on it, else a
          // banner). Leave the pending card; it clears when the match settles. No scary boot.
          cancelledIdsRef.current.delete(msg.matchId);
          showToast(msg.message || 'Opponent just joined — match is live');
        } else {
          cancelledIdsRef.current.delete(msg.matchId); // cancel refused (lockout) — card stays, allow future result/cancel
          showToast(msg.message || 'Cannot cancel yet');
        }
        break;
      case 'match-unavailable': {  // CANCEL pass: we were answering a match that's gone (cancelled/reverted)
        // Clean experience: drop the dead card, and if it's the foreground match, re-queue into a
        // FRESH game instead of the old raw "Not in this match" boot to Home.
        if (msg.matchId) { markCancelledId(msg.matchId); setPending(p => { const n = { ...p }; delete n[msg.matchId]; return n; }); }
        const wasForeground = (activeMatchRef.current === msg.matchId) && (modeRef.current === 'play' || modeRef.current === 'joining');
        activeMatchRef.current = null; matchIdRef.current = null;
        refreshServerBalance(); // any escrow for the dead match was refunded server-side
        if (wasForeground && onlineRef.current && !isChallengeRef.current) {
          showToast('That match ended — finding you a new one');
          autoRequeue();   // GUARDED auto re-queue: re-escrows + queues a new game (no boot, no infinite loop)
        } else {
          showToast('That match is no longer available');
        }
        break;
      }
      case 'game-expired': case 'async-expired': {  // pending game timed out (5-min rule) — refund stake
        if (msg.matchId) { const st1 = pending[msg.matchId] && pending[msg.matchId].stake; if (st1) applyCredit(st1, 'refund', 'Expired refund ' + st1); setPending(p => { const n = { ...p }; delete n[msg.matchId]; return n; }); refreshServerBalance(); }
        if (activeMatchRef.current === msg.matchId && (modeRef.current === 'play' || modeRef.current === 'joining')) bailHome('Game expired');
        else showToast('MATCH EXPIRED — ENTRY REFUNDED');
        break;
      }
      case 'queue-failed':
        if (RESKIN_CREDITS && msg.error === 'insufficient_funds') {
          // server is the source of truth on funds — sync balance so the HOME inline
          // 'NOT ENOUGH BALANCE' state renders (client pre-check stays as the fast path)
          refreshServerBalance(); bailHome(null); showToast('NOT ENOUGH BALANCE', 'error'); break;
        }
        bailHome(msg.error || 'Could not find a match'); break;
      case 'gps-result':
        // Server logged the fix (state or null — null falls back to IP on its side).
        // Re-queue the game the player asked for; guard already counted in handleGpsCheck.
        showToast('Location verified');
        sendQueueMsg('gps');
        break;
      case 'error':
        // GPS GATE (2026-07-15): server wants a fresh location fix before a paid game
        // (state gaming law compliance, re-checked after 3h). Run the location flow
        // instead of booting the player — gps-result re-queues automatically.
        if (msg.needGps) { handleGpsCheck(); break; }
        // CANCEL pass: defensively swallow a stale "Not in this match" (server now sends the clean
        // 'match-unavailable' instead, but an in-flight old message must never boot the player with
        // a scary "NOT IN THIS MATCH" banner — symptoms 4 & 5). Treat it as a soft re-queue.
        if (/not in this match/i.test(msg.message || '')) {
          const fg = (modeRef.current === 'joining' || modeRef.current === 'play');
          activeMatchRef.current = null; matchIdRef.current = null;
          if (fg && onlineRef.current && !isChallengeRef.current) { showToast('That match ended — finding you a new one'); autoRequeue(); }
          else showToast('That match is no longer available');
          break;
        }
        if (modeRef.current === 'joining' || modeRef.current === 'play') bailHome(msg.message || 'Server error');
        else showToast(msg.message || 'Server error');
        break;
    }
  }
  function ensureConn(after) { if (isConnected()) { after && after(); } else connectWS((m) => wsHandlerRef.current(m), () => {}, () => after && after(), () => bailHome('Connection lost')); }
  // Identity attached to answer/cancel sends so the server can verify us on a FRESH socket after a
  // reconnect (ws._asyncName is per-socket and lost on relaunch/flap; token required for credit matches).
  function authTok() { return (supabaseTokenRef.current) || (accountRef.current && accountRef.current.token) || ''; } // P2: same precedence the API calls use
  function wsIdentity() { return { name: myName(), token: (accountRef.current && accountRef.current.token) || undefined, supabaseToken: supabaseTokenRef.current || undefined }; }
  // Restore the ONE handle owned by this email account from the server (1 email = 1 account = 1 username).
  function syncAccount() { const t = supabaseTokenRef.current; if (!t) return; ensureConn(() => wsSend({ type: 'account-sync', supabaseToken: t, preferredHandle: myName() })); }
  // GPS GATE (2026-07-15): fetch one foreground fix and hand it to the server, which
  // resolves lat/lng -> state (FCC) and stores it for 3h. Permission popup shows ONCE
  // (iOS), silent after. expo-location is required at call time (same pattern as Apple
  // sign-in) so a build without the module degrades to a toast, never a crash.
  async function handleGpsCheck() {
    if (gpsRetryRef.current >= 2) { gpsRetryRef.current = 0; bailHome('Couldn\u2019t verify your location \u2014 try again'); return; }
    gpsRetryRef.current += 1;
    let Location;
    try { Location = require('expo-location'); }
    catch (e) { bailHome('This version can\u2019t verify location \u2014 update the app to play paid games'); return; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // iOS never re-shows the system popup after a decline — closest allowed UX is our
        // own popup with a one-tap jump straight to the Sense page in Settings (CJ 2026-07-15).
        bailHome(null);
        Alert.alert('Location needed', 'Paid games require location to confirm your state allows real-money play. Free games are unaffected.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Enable Location', onPress: () => { try { Linking.openSettings(); } catch (e) {} } },
        ]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      wsSend({ type: 'gps-check', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
    } catch (e) { bailHome('Couldn\u2019t get your location \u2014 try again'); }
  }
  async function sendQueueMsg(src) {
    let supaTok = supabaseTokenRef.current || undefined;
    if (supaTok) { try { const { data } = await supabase.auth.getSession(); if (data && data.session) { supaTok = data.session.access_token; supabaseTokenRef.current = supaTok; } } catch (e) {} } // refresh if needed
    // RESKIN: the tier selector queues into the matching server pool (1..4 per the
    // canonical ladder). With RESKIN=false this is the exact old line (tier 1).
    // GUARD: an off-ladder stake (e.g. from a stale experiment) would DISPLAY one number while the
    // server escrows tier-1 (50c). Snap to the ladder first so display and escrow can never disagree.
    if (RESKIN && !RESKIN_TIER_BY_CENTS[stakeRef.current]) { stakeRef.current = 50; setStake(50); }
    const qTier = RESKIN ? (RESKIN_TIER_BY_CENTS[stakeRef.current] || 1) : 1;
    wsSend({ ...queue(myName(), qTier, { paymentMode: RESKIN_CREDITS ? 'credits' : 'none' }), token: (accountRef.current && accountRef.current.token) || undefined, supabaseToken: supaTok, preferredHandle: myName(), src: src || 'tap' }); // B43: tag WHY this queue fired (tap/runback/auto/gps) — server logs it for ghost forensics
  }
  // Supabase email one-time-code sign-in
  async function sendCode() { const em = (signinEmail || '').trim(); if (!em) { showToast('Enter your email first', 'error'); return; } if (!supabase) { showToast('Sign-in unavailable in this preview build', 'error'); return; } setSigninBusy(true); try { const { error } = await supabase.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } }); if (error) showToast(error.message || 'Could not send code', 'error'); else { setSigninStep('code'); showToast('Code sent to ' + em); } } catch (e) { showToast((e && e.message) || 'Could not send code', 'error'); } setSigninBusy(false); }
  // Shared post-login (email OTP + Apple both land here) so they behave identically.
  async function afterSupabaseLogin(session) {
    supabaseTokenRef.current = session.access_token;
    setAuthEmail(session.user.email); setAuthSince(session.user.created_at);
    setSigninStep('email'); setSigninCode('');
    showToast('Signed in'); identify(session.user.id, { email: session.user.email }); syncAccount();
  }
  // Native Sign in with Apple (iOS). One tap = signup OR signin; inherits the email account path.
  async function signInWithApple() {
    if (!supabase) { showToast('Sign-in unavailable in this build', 'error'); return; }
    let AppleAuthentication, Crypto;
    try { AppleAuthentication = require('expo-apple-authentication'); Crypto = require('expo-crypto'); }
    catch (e) { showToast('Apple sign-in not available here', 'error'); return; }
    setSigninBusy(true);
    try {
      const rawNonce = `${Date.now()}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`;
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!cred.identityToken) throw new Error('No identity token from Apple');
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
      if (error) throw error;
      if (data && data.session) { await afterSupabaseLogin(data.session); track('login_apple'); }
      else throw new Error('Sign-in failed — try again');
    } catch (e) {
      if (e && (e.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(String(e && e.message)))) { /* user cancelled — silent */ }
      else showToast((e && e.message) || 'Apple sign-in failed', 'error');
    }
    setSigninBusy(false);
  }
  async function verifyCode() { const em = (signinEmail || '').trim(), code = (signinCode || '').trim(); if (!em || !code) return; if (!supabase) { showToast('Sign-in unavailable in this preview build', 'error'); return; } setSigninBusy(true); try { const { data, error } = await supabase.auth.verifyOtp({ email: em, token: code, type: 'email' }); if (error) showToast(error.message || 'Invalid code', 'error'); else if (data && data.session) { await afterSupabaseLogin(data.session); track('login'); } else { showToast('Sign-in failed — try again', 'error'); } } catch (e) { showToast((e && e.message) || 'Invalid code', 'error'); } setSigninBusy(false); }
  async function signOutAuth() {
    try { await supabase.auth.signOut(); } catch (e) {}
    supabaseTokenRef.current = null; setAuthEmail(null); setAuthSince(null);
    // SECURITY (B26): wipe the signed-in user's financial + history view on sign-out so a
    // signed-out screen can NEVER show the prior session's balance / deposits / history.
    setBalance(0); setLedger([]); setServerLedger([]); setMatchLog([]); setPending({});
    setOnlineRec({ wins: 0, losses: 0, draws: 0 }); history.current = [];
    try { await AsyncStorage.multiRemove(['sense_balance','sense_ledger','sense_hist','sense_orec','sense_praclog']); } catch (e) {}
  }
  async function deleteAccountNow() {
    // Apple 5.1.1(v): permanent server-side deletion. Server expires+refunds open games,
    // forfeits remaining credits (ledger row), frees the handle, anonymizes history.
    const tok = (accountRef.current && accountRef.current.token) || supabaseTokenRef.current || '';
    if (tok) {
      try {
        const r = await fetch(HTTPS_BASE + '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { showToast(j.error === 'unauthorized' ? 'Session expired - restart the app and try again.' : 'Could not delete account. Try again.'); return false; }
      } catch (e) { showToast('No connection. Try again.'); return false; }
    }
    // local wipe: fresh anonymous state, new generated name
    try { await supabase.auth.signOut(); } catch (e) {}
    supabaseTokenRef.current = null; accountRef.current = null; setAuthEmail(null); setAuthSince(null);
    setBalance(0); setLedger([]); setServerLedger([]); setMatchLog([]); setPending({});
    setOnlineRec({ wins: 0, losses: 0, draws: 0 }); setRec({ wins: 0, losses: 0, draws: 0 }); history.current = [];
    const fresh = generatePlayerName() + '#' + Math.floor(100 + Math.random() * 900);
    myNameRef.current = fresh; setDisplayName(fresh);
    try { await AsyncStorage.multiRemove(['sense_account','sense_balance','sense_ledger','sense_hist','sense_orec','sense_rec','sense_praclog']); await AsyncStorage.setItem('sense_handle', fresh); } catch (e) {}
    showToast('Account deleted.');
    return true;
  }
  async function changeEmail() { const em = (newEmail || '').trim(); if (!em) return; setEmailBusy(true); try { const { error } = await supabase.auth.updateUser({ email: em }); if (error) showToast(error.message); else { showToast('Check your new email to confirm'); setChangingEmail(false); setNewEmail(''); } } catch (e) { showToast('Could not update email'); } setEmailBusy(false); }
  function startQueue(src) {
    gpsRetryRef.current = 0;   // fresh PLAY tap = fresh GPS retry budget
    ensureConn(() => {
      if (accountRef.current && accountRef.current.token) sendQueueMsg(src);
      else { pendingAfterReg.current = () => sendQueueMsg(src); wsSend({ type: 'register', preferredHandle: myName() }); } // first time: claim an owned account, then queue
    });
  }
  // RESKIN_CREDITS: pull the server-authoritative balance + ledger after any credit-moving event
  // (escrow at question delivery, settle, cancel/expiry refund, insufficient-funds bounce).
  // BUG 2 FIX (2026-06-16): reconcile the pending map against the server's open list for the
  // current account. Called after any settlement/expiry event so the '1 MATCH PENDING'
  // strip + History cards stay server-authoritative even when the matching async-result
  // was missed (socket was down when the opponent matched). hydrateOpenGames is silent.
  function reconcilePending() {
    const nm = (accountRef.current && accountRef.current.handle) || myNameRef.current;
    if (nm) { try { hydrateOpenGames(nm); } catch (e) {} }
  }
  function refreshServerBalance() {
    if (!RESKIN_CREDITS) return;
    const nm = (accountRef.current && accountRef.current.handle) || myNameRef.current;
    if (nm) { try { hydrateHistory(nm); } catch (e) {} }
  }
  // BALANCE ADAPTER (stub): the ONLY place credits move. Replace these two with server/processor calls for real money.
  function applyCredit(amount, type, label) {
    if (RESKIN_CREDITS) return;   // server ledger is authoritative — never double-escrow/credit locally
    setBalance(prev => { const nb = Math.max(0, prev + amount); AsyncStorage.setItem('sense_balance', String(nb)).catch(()=>{}); return nb; });
    setLedger(prev => { const nl = [{ ts: Date.now(), type, amount, label }, ...prev].slice(0, 100); AsyncStorage.setItem('sense_ledger', JSON.stringify(nl)).catch(()=>{}); return nl; });
  }
  function startPaidOnline() {
    track('play_online', { stake });
    if (balance < stake) { showToast('Not enough credits'); return; }
    stakeRef.current = stake;
    applyCredit(-stake, 'entry', stake + ' entry');   // escrow the stake at entry (the seam where real payment plugs in)
    setConfirming(false);
    playOnline();
  }
  function playOnline() { setNotice(null); setOppName('Rival'); onlineRef.current = true; isChallengeRef.current = false; setOnline(true); setMode('joining'); startQueue('tap'); }
  // Guarded wrapper for the AUTO re-queue paths (match-unavailable / stale "not in this match").
  function autoRequeue() {
    const now = Date.now(); const grd = autoRequeueRef.current;
    if (now - grd.t > 60000) grd.n = 0;   // a minute of calm resets the window
    grd.t = now; grd.n += 1;
    if (grd.n > 3) {                        // tried enough — stop hammering, hand control back
      showToast('Couldn\u2019t find a match — tap Play to try again');
      activeMatchRef.current = null; matchIdRef.current = null;
      fadeTo(() => { setMode(null); setTab('home'); });
      return;
    }
    requeueOnline('auto');
  }
  function requeueOnline(src) {
    const s = stakeRef.current || 0;
    if (s > 0 && balance < s) { showToast('Not enough credits'); setShowActions(false); fadeTo(() => { setMode(null); setTab('home'); }); return; }
    if (s > 0) applyCredit(-s, 'entry', s + ' entry');   // replay escrows the stake too — every paid entry charges
    setNotice(null); setOppName('Rival'); setMode('joining'); startQueue(src || 'runback');
  }
  function cancelOnline() { try { if (matchIdRef.current) { markCancelledId(matchIdRef.current); wsSend(cancelMatch(matchIdRef.current)); } } catch (e) {} bailHome(null); }
  // ---- challenge (friend room) ----
  function doCreateChallenge() { setNotice(null); isChallengeRef.current = true; onlineRef.current = true; setOnline(true); ensureConn(() => createChallenge({ tier:1, playerName: myName(), paymentMode:'none' })); }
  function doJoinChallenge() { const code = (joinCode||'').trim(); if (!code) return; setNotice(null); isChallengeRef.current = true; onlineRef.current = true; setOnline(true); ensureConn(() => acceptChallenge({ gameId: code, playerName: myName() })); }
  function doRematch() { requestRematch(); setRematchReq(true); }
  function shareCode(code) { try { Share.share({ message: `Play me on Sense — join with code ${code}` }); } catch (e) {} }
  function leaveChallenge() { try { disconnectWS(); } catch(e){} onlineRef.current=false; isChallengeRef.current=false; setOnline(false); closeChallenge(); setJoinCode(''); }
  function navTo(t) { setShowActions(false); fadeTo(() => { setMode(null); setTab(t); }); }

  wsHandlerRef.current = handleOnlineMessage;
  modeRef.current = mode;
  showActionsRef.current = showActions;
  // Do NOT block the app on font loading — render immediately; Inter swaps in if/when it loads,
  // otherwise the system font is used. (Blocking here caused a permanent white screen when useFonts hung.)
  void fontsLoaded; void fontError;

  // ===== RESKIN render swap: hand the live state machine to the new UI ======
  // (after the ref assignments above so WS handlers stay wired; everything
  // below this block is the original render layer, untouched, used when
  // RESKIN=false.)
  if (RESKIN) {
    const g = {
      // live state
      tab, mode, countdown, q, picked, elapsed, result, comp, oppName, online,
      matchId, myTime, notice, toast, toastKind, banners, pending, matchLog, onlineRec, rec, pracLog, wsUp,
      balance, stake, ledger, serverLedger, sound, displayName, showActions,
      authEmail, authSince, signinEmail, signinCode, signinStep, signinBusy,
      isChallenge: isChallengeRef.current,
      // setters / actions (all pre-existing logic — nothing reimplemented)
      setTab, setStake, setCountdown, setBanners, setShowActions, setSound,
      setSigninEmail, setSigninCode, setSigninStep,
      navTo, goHome, submit, playAgain, requeueOnline, startPaidOnline,
      startPractice, cancelOnline, sendCode, verifyCode, signInWithApple, signOutAuth, doRename, deleteAccountNow,
      showToast, applyCredit, hydrateHistory, serverCredits: RESKIN_CREDITS,
      pushOn, /* B35 */ enablePush: async () => { const ok = await requestPushPermission(HTTPS_BASE, authTok); if (ok) setPushOn(true); return ok; },
      cancelPendingMatch: (mid) => { try { markCancelledId(mid); const cxlMsg = cancelMatch(mid, wsIdentity()); ensureConn(() => wsSend(cxlMsg)); } catch (e) {} showToast('Cancelling…'); setTimeout(() => { try { hydrateOpenGames(myName()); } catch (e) {} }, 4000); }, // FIX: if the terminal message is missed (socket flap), reconcile drops the card
      // refs + env
      stakeRef, accountRef, supabaseTokenRef, startRef, startOverrideRef, httpsBase: HTTPS_BASE, myName,
      resultBalBefore: resultBalBeforeRef.current, // AUDIT #4: frozen at result arrival, null in practice
    };
    const AW = PHProvider || React.Fragment;
    const ap = PHProvider ? { client: PH, autocapture: { captureScreens: false, captureTouches: true } } : {};
    return (<ErrorBoundary><AW {...ap}><ReskinApp g={g} /></AW></ErrorBoundary>);
  }

  let body;
  if (mode === 'play' && q) {
    const secLeft = Math.max(0, (TIME_LIMIT-elapsed)/1000), progress = Math.min(elapsed/TIME_LIMIT,1);
    const ans = picked !== null;
    const ringColor = ans ? C.accent : (secLeft<=3 ? C.lose : secLeft<=5 ? C.draw : C.accent); // web: ring snaps to accent on answer
    const ringText = ans ? (myTime!=null ? formatTime(Math.min(myTime,TIME_LIMIT)) : '—') : secLeft.toFixed(1);
    const youText = ans ? (picked===-1 ? '—' : formatTime(Math.min(myTime!=null?myTime:TIME_LIMIT,TIME_LIMIT))) : formatTime(elapsed);
    const themText = ans && comp ? (comp.isCorrect ? formatTime(comp.time) : 'Wrong') : '—';
    body = (<View style={{flex:1}} {...swipe.panHandlers}>
      <View style={st.playHeader}><Text style={st.pnameSm}>You</Text><Text style={st.vsTiny}>vs</Text><Text style={st.pnameSm} numberOfLines={1}>{oppName||'Rival'}</Text></View>
      {online ? <Text style={st.gameIdLine}>{isChallengeRef.current ? 'challenge · free' : ('#'+String(matchId||'').slice(0,4)+' · free')}</Text> : null}
      <View style={st.qcard}><Image source={{uri:q.image}} style={st.qimage} resizeMode="contain" /><Text style={st.qtext}>{q.text}</Text></View>
      <View style={st.scoreRow}>
        <Text style={st.scoreSide} numberOfLines={1}>You: <Text style={st.scoreStrong}>{youText}</Text></Text>
        <View style={st.miniRing}>
          <Svg width={52} height={52} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={54} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={8} />
            <Circle cx={60} cy={60} r={54} fill="none" stroke={ringColor} strokeWidth={8} strokeDasharray={CIRC54} strokeDashoffset={CIRC54*progress} strokeLinecap="round" transform="rotate(-90 60 60)" />
          </Svg>
          <View style={st.miniRingTextWrap}><Text style={[st.miniRingText,{color:ringColor}]}>{ringText}</Text></View>
        </View>
        <Text style={[st.scoreSide,{textAlign:'right'}]} numberOfLines={1}>Them: <Text style={st.scoreStrong}>{themText}</Text></Text>
      </View>
      <View style={st.answerGrid}>
        {q.options.map((opt,i) => {
          let bg=C.card, bd=C.border, col=C.text;
          if (ans){ if(i===q.correctIdx){bg='rgba(0,212,170,0.18)';bd='#00D4AA';col='#0F766E';} else if(i===picked){bg='rgba(255,71,87,0.18)';bd='#FF4757';col='#991B1B';} }
          return <Pressable key={i} disabled={ans} onPress={()=>submit(i)} style={[st.gridBtn,{backgroundColor:bg,borderColor:bd}]}><Text style={[st.gridBtnText,{color:col}]}>{opt}</Text></Pressable>;
        })}
      </View>
      {ans && online ? <Text style={st.waitMsg}>Waiting for opponent…</Text> : null}
      {showActions ? (
        <View style={st.pendingActions}>
          <View style={{width:'100%',alignItems:'center'}}><GlossyButton label="RUN IT BACK" onPress={()=>{ setShowActions(false); requeueOnline(); }} small /></View>
          <View style={st.pendingRow}>
            <Pressable style={st.pendBtn} onPress={()=>navTo('history')}><Text style={st.pendBtnText}>History</Text></Pressable>
            <Pressable style={st.pendBtn} onPress={()=>navTo('home')}><Text style={st.pendBtnText}>Home</Text></Pressable>
          </View>
          <Text style={st.swipeHint}>swipe up to play again</Text>
        </View>
      ) : null}
    </View>);
  } else if (mode === 'results' && result) {
    const win = result.result==='win', draw = result.result==='draw';
    const color = win ? C.win : draw ? C.draw : C.lose;
    const myCorrect = picked === q.correctIdx, oppCorrect = comp.isCorrect;
    const banner = pickBanner(result.result, myCorrect, oppCorrect, comp.playerTime, oppCorrect?comp.time:null);
    const ctype = win ? 'win' : draw ? 'draw' : 'loss';
    const isChal = isChallengeRef.current;
    const statRec = online ? onlineRec : rec;
    body = (<ResultsView {...{win, draw, color, banner, ctype, myCorrect, oppCorrect, reason: result.reason, q, comp, picked, rec: statRec, oppName, online, isChallenge: isChal, rematchReq, oppWantsRematch: challenge && challenge.opponentWantsRematch, onRematch: doRematch, playAgain, goHome}} />);
  } else if (mode === 'joining') {
    body = (<View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      <Text style={st.waitTitle}>Finding Opponent…</Text>
      <Text style={st.waitSub}>Matching you with a live player</Text>
      <JoiningDots />
      <Pressable onPress={cancelOnline} style={st.cancelLink}><Text style={st.cancelText}>Cancel</Text></Pressable>
    </View>);
  } else {
    let screen;
    if (tab === 'home') {
      const winUpTo = Math.round(stake * 1.9);
      screen = (
        <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingTop:60}}>
          <Text style={st.bigBrand}>SENSE</Text>
          <Text style={st.tagline}>How fast can you name the animal?</Text>
          <View style={st.recPill}><Text style={st.recPillText}>{onlineRec.wins}W · {onlineRec.losses}L · {onlineRec.draws}D</Text></View>
          <View style={st.balPill}><Text style={st.balPillText}>{balance} credits</Text></View>
          {confirming ? (
            <View style={st.confirmCard}>
              <Text style={st.confirmTitle}>Entering {stake}-credit match</Text>
              <Text style={st.confirmSub}>Win up to {winUpTo} · balance {balance} → {Math.max(0,balance-stake)}</Text>
              {balance < stake
                ? <Text style={st.noticeText}>Not enough credits</Text>
                : <View style={{width:'100%',alignItems:'center',marginTop:14}}><GlossyButton label="CONFIRM & PLAY" onPress={startPaidOnline} /></View>}
              <Pressable onPress={()=>setConfirming(false)} style={st.practiceLink}><Text style={st.practiceLinkText}>Back</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={st.stakeRow}>
                {[10,50,100].map(sv => (
                  <Pressable key={sv} onPress={()=>setStake(sv)} style={[st.stakeChip, stake===sv && st.stakeChipOn]}>
                    <Text style={[st.stakeChipText, stake===sv && st.stakeChipTextOn]}>{sv}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={st.stakeHint}>entry · credits</Text>
              <View style={{height:14}} />
              <View style={{width:'100%',alignItems:'center'}}><GlossyButton label="PLAY ONLINE" onPress={()=>setConfirming(true)} /></View>
              <Text style={st.note}>Real opponents · free credits · fastest correct answer wins.</Text>
              <Pressable onPress={startPractice} style={st.practiceLink}><Text style={st.practiceLinkText}>Practice vs computer</Text></Pressable>
            </>
          )}
          {notice ? <Text style={st.noticeText}>{notice}</Text> : null}
        </View>
      );
    } else if (tab === 'challenge') {
      screen = <ChallengeScreen challenge={challenge} joinCode={joinCode} setJoinCode={setJoinCode} onCreate={doCreateChallenge} onJoin={doJoinChallenge} onShare={shareCode} onCancel={leaveChallenge} />;
    } else if (tab === 'leaderboard') {
      screen = <LeaderboardScreen httpsBase={HTTPS_BASE} />;
    } else if (tab === 'history') {
      screen = <HistoryScreen matchLog={matchLog} pending={pending} ledger={ledger} onCancel={(mid)=>{ try{ markCancelledId(mid); wsSend(cancelMatch(mid)); }catch(e){} showToast('Cancelling…'); setTimeout(()=>{ try{ hydrateOpenGames(myName()); }catch(e){} }, 4000); }} />;
    } else {
      const authUI = !supabase ? null : (authEmail ? (
        <View style={st.authBox}>
          <Text style={st.profLabel}>Account</Text>
          <Text style={st.profValue}>{authEmail}</Text>
          {authSince ? <Text style={st.memberSince}>Member since {new Date(authSince).toLocaleDateString(undefined,{month:'short',year:'numeric'})}</Text> : null}
          {changingEmail ? (
            <View style={{marginTop:10}}>
              <TextInput value={newEmail} onChangeText={setNewEmail} placeholder="new@email.com" placeholderTextColor={C.text2} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={st.authInput} />
              <Pressable onPress={changeEmail} disabled={emailBusy||!newEmail} style={[st.authBtn,(emailBusy||!newEmail)&&{opacity:0.5}]}><Text style={st.authBtnText}>{emailBusy?'Sending\u2026':'Send confirmation'}</Text></Pressable>
              <Pressable onPress={()=>setChangingEmail(false)} style={st.authLink}><Text style={st.authLinkText}>Cancel</Text></Pressable>
            </View>
          ) : (
            <View style={{flexDirection:'row',marginTop:10}}>
              <Pressable onPress={()=>setChangingEmail(true)} style={[st.acctBtn,{marginRight:8}]}><Text style={st.acctBtnText}>Change email</Text></Pressable>
              <Pressable onPress={signOutAuth} style={[st.acctBtn,st.acctBtnDanger]}><Text style={[st.acctBtnText,{color:C.lose}]}>Log out</Text></Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={st.authBox}>
          <Text style={st.profLabel}>Sign in to save your account</Text>
          {signinStep !== 'code' ? (
            <>
              <TextInput value={signinEmail} onChangeText={setSigninEmail} placeholder="your@email.com" placeholderTextColor={C.text2} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={st.authInput} />
              <Pressable onPress={sendCode} disabled={signinBusy || !signinEmail} style={[st.authBtn, (signinBusy || !signinEmail) && { opacity: 0.5 }]}><Text style={st.authBtnText}>{signinBusy ? 'Sending…' : 'Send code'}</Text></Pressable>
            </>
          ) : (
            <>
              <Text style={st.waitSub}>Enter the code emailed to {signinEmail}</Text>
              <TextInput value={signinCode} onChangeText={setSigninCode} placeholder="Code" placeholderTextColor={C.text2} keyboardType="number-pad" style={st.authInput} />
              <Pressable onPress={verifyCode} disabled={signinBusy || !signinCode} style={[st.authBtn, (signinBusy || !signinCode) && { opacity: 0.5 }]}><Text style={st.authBtnText}>{signinBusy ? 'Verifying…' : 'Verify & sign in'}</Text></Pressable>
              <Pressable onPress={() => { setSigninStep('email'); setSigninCode(''); }} style={st.authLink}><Text style={st.authLinkText}>Use a different email</Text></Pressable>
            </>
          )}
        </View>
      ));
      screen = <ProfileScreen rec={rec} onlineRec={onlineRec} streakVal={streak(history.current)} sound={sound} setSound={setSound} handle={displayName || myName()} authUI={authUI} onRename={doRename} editingName={editingName} setEditingName={setEditingName} nameInput={nameInput} setNameInput={setNameInput} nameBusy={nameBusy} balance={balance} ledger={ledger} />;
    }
    body = (<>
      <ScrollView contentContainerStyle={{flexGrow:1,paddingBottom:96}}>{screen}</ScrollView>
      <View style={st.nav}>
        <NavBtn label="Play" icon="play" active={tab==='home'} onPress={()=>setTab('home')} />
        <NavBtn label="Challenge" icon="challenge" active={tab==='challenge'} onPress={()=>setTab('challenge')} />
        <NavBtn label="Profile" icon="profile" active={tab==='profile'} onPress={()=>setTab('profile')} />
        <NavBtn label="Hosts" icon="hosts" active={tab==='leaderboard'} onPress={()=>setTab('leaderboard')} />
        <NavBtn label="History" icon="history" active={tab==='history'} onPress={()=>setTab('history')} badge={Object.keys(pending).length} />
      </View>
    </>);
  }

  const AWrap = PHProvider || React.Fragment;
  const aProps = PHProvider ? { client: PH, autocapture: { captureScreens: false, captureTouches: true } } : {};
  return (<ErrorBoundary><AWrap {...aProps}><ImageBackground source={{uri:BG}} resizeMode="cover" style={{flex:1,backgroundColor:C.page}}>
    <StatusBar barStyle="dark-content" />
    <Animated.View style={{flex:1,opacity:fade}}><SafeAreaView style={{flex:1,paddingHorizontal:22}}>{body}</SafeAreaView></Animated.View>
    {banners.length > 0 && (
      <View style={st.bannerWrap} pointerEvents="box-none">
        {banners.map(b => <Banner key={b.id} data={b} onPress={()=>{ setBanners(prev=>prev.filter(x=>x.id!==b.id)); navTo('history'); }} />)}
      </View>
    )}
    {toast ? <View style={st.toastWrap} pointerEvents="none"><View style={st.toast}><Text style={st.toastText}>{toast}</Text></View></View> : null}
    {countdown && mode==='play' && <Countdown onDone={()=>setCountdown(false)} />}
  </ImageBackground></AWrap></ErrorBoundary>);
}

function ResultsView({ win, draw, color, banner, ctype, myCorrect, oppCorrect, reason, q, comp, picked, rec, oppName, online, isChallenge, rematchReq, oppWantsRematch, onRematch, playAgain, goHome }) {
  const both = myCorrect && oppCorrect;
  const [step, setStep] = useState('reveal'); const [oppRevealed, setOppRevealed] = useState(false);
  const [youStamp, setYouStamp] = useState(false); const [oppStamp, setOppStamp] = useState(false);
  const youA = useRef(new Animated.Value(0)).current, oppA = useRef(new Animated.Value(0)).current, bannerA = useRef(new Animated.Value(0)).current;
  const cardA = useRef(new Animated.Value(0)).current, btnsA = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const timers = useRef([]);
  const myAns = picked === -1 ? 'Timed out' : q.options[picked];
  const oppAns = oppCorrect ? q.options[q.correctIdx] : 'Wrong';
  const payoutText = win ? '✓ Correct' : draw ? '—' : (myCorrect ? '⏱ Too Slow' : '✗ Wrong');
  const spMs = picked===-1 ? null : comp.playerTime; // §1 juice: reward fast correct answers with a speed-tier stamp
  const speed = (win && spMs!=null) ? (spMs<600 ? {t:'🔥 INSANE',c:'#EC4899'} : spMs<1000 ? {t:'⚡ LIGHTNING',c:C.accent} : spMs<1600 ? {t:'FAST',c:C.win} : null) : null;
  // §3 juice: near-miss emphasis — both right, you lost the timing race by a hair. Makes a heartbreaker sting (motivating the rematch) instead of looking like a random loss.
  const lossMarginMs = (both && !win && !draw) ? (comp.playerTime - comp.time) : null;
  const nearMiss = lossMarginMs != null && lossMarginMs > 0 && lossMarginMs <= 250;
  const nearMissTxt = nearMiss ? `💔 SO CLOSE · lost by ${(lossMarginMs/1000).toFixed(2)}s` : null;

  function explode() {
    setStep('explode'); hap(win?Haptics.ImpactFeedbackStyle.Heavy:Haptics.ImpactFeedbackStyle.Medium); if (win) playSfx('win');
    if (nearMiss) timers.current.push(setTimeout(()=>hap(Haptics.ImpactFeedbackStyle.Light), 140)); // §3: double-tap "heartbeat" on a heartbreaker loss
    bannerA.setValue(0); cardA.setValue(0); btnsA.setValue(0);
    // web doExplosion: burst fires first; banner springs in at +180ms, card fades +0.4s after it, buttons at +980ms
    Animated.timing(bannerA,{toValue:1,duration:350,delay:180,easing:Easing.bezier(0.34,1.56,0.64,1),useNativeDriver:true}).start();
    Animated.timing(cardA,{toValue:1,duration:400,delay:580,easing:Easing.bezier(0,0,0.2,1),useNativeDriver:true}).start();
    Animated.timing(btnsA,{toValue:1,duration:300,delay:980,easing:Easing.out(Easing.ease),useNativeDriver:true}).start();
    timers.current.push(setTimeout(()=>setReady(true), 980));
  }

  useEffect(() => {
    const t=(fn,ms)=>{ const id=setTimeout(fn,ms); timers.current.push(id); return id; };
    t(()=>{ Animated.timing(youA,{toValue:1,duration:400,easing:Easing.bezier(0,0,0.2,1),useNativeDriver:true}).start(); hap(myCorrect?Haptics.ImpactFeedbackStyle.Light:Haptics.ImpactFeedbackStyle.Medium); playSfx(myCorrect?'correct':'wrong'); if(!myCorrect) t(()=>setYouStamp(true),400); }, 200);
    t(()=>Animated.timing(oppA,{toValue:1,duration:500,easing:Easing.bezier(0,0,0.2,1),useNativeDriver:true}).start(), 800);
    t(()=>{ setOppRevealed(true); hap(Haptics.ImpactFeedbackStyle.Light); if(!oppCorrect) t(()=>setOppStamp(true),200); }, 1500);
    if (both) t(()=>setStep('race'), 2400); else t(()=>explode(), 2800);
    return ()=>timers.current.forEach(clearTimeout);
  }, []);

  const trY = (a)=>({opacity:a, transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[14,0]})}]});
  if (step === 'race') return (<View style={{flex:1}}><TimeRace myT={comp.playerTime} oppT={comp.time} oppName={oppName} onDone={explode} /></View>);
  if (step === 'explode') {
    const bScale = bannerA.interpolate({inputRange:[0,1],outputRange:[1.3,1]});
    const bTy = bannerA.interpolate({inputRange:[0,1],outputRange:[30,0]});
    return (<View style={{flex:1}}>
      <Flash color={win?'rgba(34,197,94,0.35)':draw?'rgba(245,158,11,0.3)':'rgba(239,68,68,0.45)'} />
      {win && <Flash color="rgba(255,255,255,0.6)" delay={60} />}
      {win && <Flash color="rgba(34,197,94,0.25)" delay={150} />}
      {!win && !draw && <RedPulse />}
      {SK ? <SkiaExplosion kind={ctype} /> : (<>
        <Shockwave color={color} />
        {win && <Shockwave color={C.accent} delay={100} />}
        {win && <Shockwave color={C.draw} delay={200} />}
        <Confetti type={ctype} />
      </>)}
      <View style={{flex:1,justifyContent:'center'}}>
        <Animated.Text style={[st.banner,{ color, opacity:bannerA, transform:[{translateY:bTy},{scale:bScale}] }]}>{banner}</Animated.Text>
        <Animated.View style={{ opacity:cardA, transform:[{translateY:cardA.interpolate({inputRange:[0,1],outputRange:[16,0]})}] }}>
        <Text style={[st.payAmount,{color}]} numberOfLines={1}>{payoutText}</Text>
        <Text style={st.payLabel}>{isChallenge ? 'Challenge' : online ? 'Online Match' : 'Practice Mode'}</Text>
        {speed ? <View style={[st.speedPill,{borderColor:speed.c}]}><Text style={[st.speedTxt,{color:speed.c}]}>{speed.t}</Text></View> : nearMiss ? <View style={[st.speedPill,{borderColor:C.lose}]}><Text style={[st.speedTxt,{color:C.lose}]}>{nearMissTxt}</Text></View> : null}
        <View style={st.resultCard}>
          <View style={st.playerRow}>
            <Text style={st.playerLabel}>YOU</Text>
            <View style={st.playerData}>
              <Text style={[st.playerAns,{color:myCorrect?C.win:C.lose}]} numberOfLines={1}>{myAns}</Text>
              <Text style={st.playerTime}>{picked===-1?'—':formatTime(comp.playerTime)}</Text>
            </View>
          </View>
          <View style={st.hDivider} />
          <View style={st.playerRow}>
            <Text style={st.playerLabel} numberOfLines={1}>{(oppName||'RIVAL').toUpperCase()}</Text>
            <View style={st.playerData}>
              <Text style={[st.playerAns,{color:oppCorrect?C.win:C.lose}]} numberOfLines={1}>{oppAns}</Text>
              <Text style={st.playerTime}>{oppCorrect?formatTime(comp.time):'—'}</Text>
            </View>
          </View>
          <View style={st.hDivider} />
          <View style={st.correctRow}>
            <Text style={st.correctLabel}>Correct answer</Text>
            <Text style={st.correctValue} numberOfLines={1}>{q.options[q.correctIdx]}</Text>
          </View>
        </View>
        <View style={st.statsRow}>
          <View style={st.miniStat}><Text style={[st.miniStatNum,{color:C.win}]}>{rec.wins}</Text><Text style={st.miniStatLabel}>WINS</Text></View>
          <View style={st.miniStat}><Text style={[st.miniStatNum,{color:C.draw}]}>{rec.draws}</Text><Text style={st.miniStatLabel}>DRAWS</Text></View>
          <View style={st.miniStat}><Text style={[st.miniStatNum,{color:C.lose}]}>{rec.losses}</Text><Text style={st.miniStatLabel}>LOSSES</Text></View>
        </View>
        </Animated.View>
        <Animated.View style={{ opacity:btnsA }} pointerEvents={ready?'auto':'none'}>
        {isChallenge && oppWantsRematch && !rematchReq ? <Text style={st.rematchHint}>{(oppName||'Rival')} wants a rematch</Text> : null}
        <View style={{ width:'100%', alignItems:'center', marginTop:18 }}>
          <GlossyButton
            label={isChallenge ? (rematchReq ? 'WAITING…' : (oppWantsRematch ? 'ACCEPT REMATCH' : 'REMATCH')) : 'RUN IT BACK'}
            onPress={isChallenge ? (rematchReq ? ()=>{} : onRematch) : playAgain}
            small />
        </View>
        <Pressable style={st.ghost} onPress={goHome}><Text style={st.ghostText}>Home</Text></Pressable>
        </Animated.View>
      </View>
    </View>);
  }
  return (<View style={{flex:1}}>
    <View style={{flex:1,justifyContent:'center'}}>
      <View>
        <Animated.View style={trY(youA)}>
          <Text style={st.revealLabel}>YOUR ANSWER</Text>
          <Text style={[st.revealAns,{color:myCorrect?C.win:C.lose}]}>{myAns}</Text>
          <Text style={[st.revealStatus,{color:myCorrect?C.win:C.lose}]}>{myCorrect?'✓ CORRECT':'✕ WRONG'}</Text>
        </Animated.View>
        {youStamp && <WrongStamp />}
      </View>
      <View style={st.revealDivider} />
      <View>
        <Animated.View style={trY(oppA)}>
          <Text style={st.revealLabel}>{(oppName||'RIVAL').toUpperCase()}</Text>
          <Text style={[st.revealAns,{color:oppRevealed?(oppCorrect?C.win:C.lose):C.text2}]}>{oppRevealed?oppAns:'???'}</Text>
          <Text style={[st.revealStatus,{color:oppRevealed?(oppCorrect?C.win:C.lose):C.text2}]}>{oppRevealed?(oppCorrect?'✓ CORRECT':'✕ WRONG'):'...'}</Text>
        </Animated.View>
        {oppStamp && <WrongStamp />}
      </View>
    </View>
  </View>);
}

function GlossyButton({ label, onPress, small }) {
  return (<Pressable onPress={onPress} style={{ width:'100%', maxWidth:small?320:360 }}>
    <LinearGradient colors={['#555','#333','#1a1a1a','#111','#0a0a0a']} locations={[0,0.2,0.45,0.55,1]} style={[st.glossy, small&&{paddingVertical:16}]}>
      <View style={st.glossyHi} /><Text style={[st.glossyText, small&&{fontSize:16,letterSpacing:1.5}]}>{label}</Text>
    </LinearGradient>
  </Pressable>);
}
function streak(h){ let n=0; for(let i=h.length-1;i>=0&&h[i];i--)n++; return n; }
function Stat({ label, value }){ return (<View style={st.stat}><Text style={st.statVal}>{value}</Text><Text style={st.statLabel}>{label}</Text></View>); }
function NavIcon({ type, color }){
  return (<Svg width={22} height={22} viewBox="0 0 24 24" fill={color}>
    {type==='play' ? <Polygon points="6 3 20 12 6 21" />
     : type==='challenge' ? <Path d="M5 3h14v2H5zm0 2v4c0 1.1.4 2 1 2.7V20h3v-4h6v4h3v-8.3c.6-.7 1-1.6 1-2.7V5h-2v4c0 .6-.4 1-1 1h-2V5H9v5H7c-.6 0-1-.4-1-1V5H5zM3 5a2 2 0 00-1 3.5V10l2-1V5H3zm18 0v4l2 1V8.5A2 2 0 0021 5z" />
     : type==='hosts' ? <><Circle cx={9} cy={7} r={4} /><Path d="M2 21v-2c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4v2H2z" /><Circle cx={17} cy={7} r={3} /><Path d="M22 21v-2c0-1.5-.8-2.8-2-3.5-.4.3-.8.6-1.3.8 1.3.7 2.3 2 2.3 3.7v1h1z" /></>
     : type==='history' ? <Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7V7z" />
     : <><Circle cx={12} cy={8} r={4.5} /><Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8H4z" /></>}
  </Svg>);
}
function NavBtn({ label, icon, active, onPress, badge=0 }){ const c = active?C.accent:C.text2; return (<Pressable style={st.navBtn} onPress={onPress}><View><NavIcon type={icon} color={c} />{badge>0 ? <View style={st.navBadge}><Text style={st.navBadgeText}>{badge}</Text></View> : null}</View><Text style={[st.navText,{color:c}, active&&{fontFamily:F.x}]}>{label}</Text></Pressable>); }
// ===== Tab screens (online parity) =====
function ChallengeScreen({ challenge, joinCode, setJoinCode, onCreate, onJoin, onShare, onCancel }) {
  const status = challenge && challenge.status;
  if (status === 'waiting' && challenge.role === 'host') {
    return (<View style={{paddingTop:48,alignItems:'center'}}>
      <Text style={st.screenTitle}>Challenge Created</Text>
      <Text style={st.waitSub}>Share this code with a friend</Text>
      <View style={st.codeBox}><Text style={st.codeText}>{challenge.gameId}</Text></View>
      <View style={{width:'100%',alignItems:'center',marginTop:8}}><GlossyButton label="SHARE CODE" onPress={()=>onShare(challenge.gameId)} small /></View>
      <View style={st.waitRow}><Text style={st.waitSub}>Waiting for opponent</Text><JoiningDots /></View>
      <Pressable onPress={onCancel} style={st.cancelLink}><Text style={st.cancelText}>Cancel</Text></Pressable>
    </View>);
  }
  if (status === 'joined' && challenge.role === 'host') {
    return (<View style={{paddingTop:80,alignItems:'center'}}><Text style={st.screenTitle}>Opponent Joined!</Text><Text style={st.waitSub}>{challenge.joinerName} accepted — starting…</Text><JoiningDots /></View>);
  }
  if (status === 'accepting' || (status === 'joined' && challenge.role === 'joiner')) {
    return (<View style={{paddingTop:80,alignItems:'center'}}><Text style={st.screenTitle}>{status==='joined'?'Challenge Accepted!':'Joining…'}</Text>{status==='joined'?<Text style={st.waitSub}>Playing against {challenge.hostName} — starting…</Text>:null}<JoiningDots /></View>);
  }
  return (<View style={{paddingTop:48}}>
    <Text style={st.screenTitle}>Challenge a Friend</Text>
    <Text style={st.waitSub}>Create a game, send the code — first to answer fastest wins.</Text>
    <View style={{height:24}} />
    <View style={{width:'100%',alignItems:'center'}}><GlossyButton label="CREATE CHALLENGE" onPress={onCreate} /></View>
    <View style={st.orRow}><View style={st.orLine} /><Text style={st.orText}>OR JOIN WITH A CODE</Text><View style={st.orLine} /></View>
    <View style={st.joinRow}>
      <TextInput value={joinCode} onChangeText={setJoinCode} placeholder="Enter code" placeholderTextColor={C.text2} autoCapitalize="none" autoCorrect={false} style={st.joinInput} />
      <Pressable onPress={onJoin} style={[st.joinBtn, !joinCode && {opacity:0.5}]} disabled={!joinCode}><Text style={st.joinBtnText}>Join</Text></Pressable>
    </View>
  </View>);
}
function LeaderboardScreen({ httpsBase }) {
  const [data, setData] = useState([]); const [mode, setMode] = useState('free'); const [sortBy, setSortBy] = useState('wins'); const [loading, setLoading] = useState(false);
  useEffect(() => { let alive=true; setLoading(true);
    fetch(`${httpsBase}/api/leaderboard?mode=${mode}&limit=20`).then(r=>r.json()).then(d=>{ if(!alive)return; const players = Array.isArray(d)?d:(d.leaderboard||d.players||[]); setData(players); setLoading(false); }).catch(()=>{ if(!alive)return; setData([]); setLoading(false); });
    return ()=>{ alive=false; }; }, [mode]);
  const sorted = [...data].sort((a,b)=>{ if(sortBy==='wins')return (b.wins||0)-(a.wins||0); if(sortBy==='winrate'){ const ar=(a.wins+a.losses+a.draws)>=10?a.wins/(a.wins+a.losses+a.draws):0, br=(b.wins+b.losses+b.draws)>=10?b.wins/(b.wins+b.losses+b.draws):0; return br-ar; } if(sortBy==='earnings')return (b.net_pnl||0)-(a.net_pnl||0); return 0; });
  return (<View style={{paddingTop:48}}>
    <Text style={st.screenTitle}>Leaderboard</Text>
    <View style={st.segRow}>{['free','paid'].map(m=><Pressable key={m} onPress={()=>setMode(m)} style={[st.seg, mode===m&&st.segOn]}><Text style={[st.segText, mode===m&&st.segTextOn]}>{m==='free'?'Free':'Paid'}</Text></Pressable>)}</View>
    <View style={st.sortRow}><Text style={st.sortLabel}>Sort:</Text>{[['wins','Wins'],['winrate','Win Rate'],['earnings','Earnings']].map(([k,l])=><Pressable key={k} onPress={()=>setSortBy(k)} style={st.sortBtn}><Text style={[st.sortText, sortBy===k&&{color:C.accent,fontFamily:F.x}]}>{l}</Text></Pressable>)}</View>
    {loading ? <Text style={st.emptyText}>Loading…</Text> : sorted.length===0 ? <Text style={st.emptyText}>No players yet.</Text> : (
      <View style={st.lbTable}>
        <View style={st.lbHead}><Text style={[st.lbCellRank,st.lbHeadText]}>#</Text><Text style={[st.lbCellName,st.lbHeadText]}>Player</Text><Text style={[st.lbCell,st.lbHeadText]}>W</Text><Text style={[st.lbCell,st.lbHeadText]}>L</Text><Text style={[st.lbCell,st.lbHeadText]}>D</Text><Text style={[st.lbCellNet,st.lbHeadText]}>Net</Text></View>
        {sorted.map((p,i)=>(<View key={p.name+i} style={st.lbRow}><Text style={st.lbCellRank}>{i+1}</Text><Text style={st.lbCellName} numberOfLines={1}>{p.name}</Text><Text style={[st.lbCell,{color:C.win}]}>{p.wins}</Text><Text style={[st.lbCell,{color:C.lose}]}>{p.losses}</Text><Text style={st.lbCell}>{p.draws}</Text><Text style={[st.lbCellNet,{color:(p.net_pnl||0)>=0?C.win:C.lose}]}>${((p.net_pnl||0)/100).toFixed(2)}</Text></View>))}
      </View>
    )}
  </View>);
}
function timeAgo(ts){ if(!ts)return''; const d=Date.now()-new Date(ts).getTime(), m=Math.floor(d/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; const h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }
function HistoryScreen({ matchLog, pending, ledger, onCancel }) {
  const pend = Object.entries(pending||{});
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return (<View style={{paddingTop:48}}>
    <Text style={st.screenTitle}>Match History</Text>
    {pend.length>0 && (<View style={{marginBottom:8}}><Text style={st.sectionSub}>Pending</Text>
      {pend.map(([mid,d])=>{ const locked = d.ts && (now - d.ts) < 120000; const remain = Math.ceil((120000 - (now - (d.ts||0))) / 1000); return (<View key={mid} style={st.histRow}><View style={st.histMain}><View style={[st.badge,{backgroundColor:'rgba(108,99,255,0.15)'}]}><Text style={[st.badgeText,{color:C.accent}]}>PENDING</Text></View><Text style={st.histOpp} numberOfLines={1}>vs {d.opponent||'Searching…'}</Text></View><Pressable onPress={()=>{ if(!locked) onCancel(mid); }} disabled={locked} style={[st.histCancel, locked&&{opacity:0.45}]}><Text style={st.histCancelText}>{locked ? `${remain}s` : 'Cancel'}</Text></Pressable></View>); })}
    </View>)}
    {(ledger && ledger.length>0) ? (<View style={{marginBottom:14}}><Text style={st.sectionSub}>Transactions</Text>
      {ledger.slice(0,8).map((t,i)=>(<View key={i} style={st.ledgerRow}><Text style={st.ledgerLabel}>{t.label}</Text><Text style={[st.ledgerAmt,{color:t.amount>=0?C.win:C.lose}]}>{t.amount>=0?'+':''}{t.amount}</Text></View>))}
    </View>) : null}
    {matchLog.length===0 && pend.length===0 ? <Text style={st.emptyText}>No matches yet. Play a game!</Text> : null}
    {matchLog.map((m,idx)=>{ const rc = m.result==='win'?C.win:m.result==='loss'?C.lose:C.draw; const rl = m.result==='win'?'WIN':m.result==='loss'?'LOSS':'DRAW';
      return (<View key={m.matchId||idx} style={st.histRow}>
        <View style={st.histMain}><View style={[st.badge,{backgroundColor:rc+'22'}]}><Text style={[st.badgeText,{color:rc}]}>{rl}</Text></View><Text style={st.histOpp} numberOfLines={1}>vs {m.opponent}</Text></View>
        <View style={st.histDetails}><Text style={st.histDetail}>You: {m.myTime!=null?formatTime(m.myTime):'—'}</Text><Text style={st.histDetail}>Them: {m.oppTime!=null?formatTime(m.oppTime):'—'}</Text><Text style={st.histDetail}>{getReasonText(m.reason)}</Text>{m.timestamp?<Text style={st.histDetail}>{timeAgo(m.timestamp)}</Text>:null}</View>
      </View>); })}
  </View>);
}
function ProfileScreen({ rec, onlineRec, streakVal, sound, setSound, handle, authUI, onRename, editingName, setEditingName, nameInput, setNameInput, nameBusy, balance, ledger }) {
  const oplayed = onlineRec.wins+onlineRec.losses+onlineRec.draws, oacc = oplayed?Math.round(onlineRec.wins/oplayed*100):0;
  const netLifetime = (ledger||[]).reduce((a,t)=>a+(t.amount||0),0);
  return (<View style={{paddingTop:48}}>
    <Text style={st.screenTitle}>Profile</Text>
    {authUI || null}
    <View style={st.profSection}><Text style={st.profLabel}>Credits</Text><Text style={st.profValue}>{balance} credits (free)</Text><Text style={[st.memberSince,{marginTop:2}]}>Net lifetime: {netLifetime>=0?'+':''}{netLifetime} credits</Text></View>
    <View style={st.profSection}>
      <Text style={st.profLabel}>Username</Text>
      {editingName ? (
        <View style={{flexDirection:'row',alignItems:'center',marginTop:4}}>
          <TextInput value={nameInput} onChangeText={setNameInput} placeholder={handle} placeholderTextColor={C.text2} autoCapitalize="none" autoCorrect={false} maxLength={16} style={[st.authInput,{flex:1,marginBottom:0,marginRight:8}]} />
          <Pressable onPress={()=>onRename(nameInput)} disabled={nameBusy} style={[st.authBtn,{marginRight:8},nameBusy&&{opacity:0.5}]}><Text style={st.authBtnText}>{nameBusy?'…':'Save'}</Text></Pressable>
          <Pressable onPress={()=>setEditingName(false)}><Text style={st.authLinkText}>Cancel</Text></Pressable>
        </View>
      ) : (
        <Pressable onPress={()=>{ setNameInput(String(handle||'').replace(/#.*/,'')); setEditingName(true); }}><Text style={[st.profValue,{textDecorationLine:'underline'}]}>{handle}  ✎</Text></Pressable>
      )}
    </View>
    <Text style={st.profLabel}>Online Stats</Text>
    <View style={st.statGrid}><Stat label="Played" value={oplayed} /><Stat label="Wins" value={onlineRec.wins} /><Stat label="Accuracy" value={oacc+'%'} /></View>
    <View style={st.statGrid}><Stat label="Losses" value={onlineRec.losses} /><Stat label="Draws" value={onlineRec.draws} /><Stat label="Streak" value={streakVal} /></View>
    <View style={{height:10}} />
    <Text style={st.profLabel}>Practice Stats</Text>
    <View style={st.statGrid}><Stat label="Wins" value={rec.wins} /><Stat label="Losses" value={rec.losses} /><Stat label="Draws" value={rec.draws} /></View>
    <Pressable style={st.toggleRow} onPress={()=>setSound(x=>!x)}><Text style={st.toggleLabel}>Sound</Text><View style={[st.toggle,sound&&{backgroundColor:C.accent}]}><View style={[st.knob,sound&&{alignSelf:'flex-end'}]} /></View></Pressable>
  </View>);
}
function JoiningDots(){
  const a = useRef([0,1,2].map(()=>new Animated.Value(0.3))).current;
  useEffect(()=>{ const loops = a.map((v,i)=>Animated.loop(Animated.sequence([Animated.delay(i*160),Animated.timing(v,{toValue:1,duration:400,useNativeDriver:true}),Animated.timing(v,{toValue:0.3,duration:400,useNativeDriver:true})]))); loops.forEach(l=>l.start()); return ()=>loops.forEach(l=>l.stop()); },[]);
  return (<View style={{flexDirection:'row',marginTop:22,marginBottom:26}}>{a.map((v,i)=><Animated.View key={i} style={{width:10,height:10,borderRadius:5,backgroundColor:C.accent,marginHorizontal:5,opacity:v}} />)}</View>);
}
function Banner({ data, onPress }) {
  // fade in (200ms), hold, fade out (300ms) before the 4s removal — matches web .result-notification + fade-out
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(o,{toValue:1,duration:200,useNativeDriver:true}).start(); const t=setTimeout(()=>Animated.timing(o,{toValue:0,duration:300,useNativeDriver:true}).start(),3600); return ()=>clearTimeout(t); }, []);
  const c = data.result==='win'?C.win:data.result==='loss'?C.lose:C.draw;
  return (<Animated.View style={{opacity:o}}><Pressable onPress={onPress} style={[st.banner2,{borderLeftColor:c}]}><Text style={st.banner2Text}>{data.text}</Text><Text style={st.banner2Tap}>Tap for details</Text></Pressable></Animated.View>);
}

const st = StyleSheet.create({
  playHeader:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,marginTop:14}, pnameSm:{fontSize:11,color:C.text2,fontFamily:'Courier New'}, vsTiny:{fontSize:8,color:C.text2,opacity:0.4,letterSpacing:1,textTransform:'uppercase'},
  bigBrand:{fontSize:56,fontFamily:F.k,letterSpacing:7,color:C.accent}, tagline:{fontSize:15,color:C.text2,marginTop:14,textAlign:'center',fontFamily:F.m},
  recPill:{backgroundColor:'rgba(108,99,255,0.10)',borderRadius:999,paddingHorizontal:20,paddingVertical:9,marginTop:22}, recPillText:{color:C.accent,fontFamily:F.x,fontSize:14},
  memberSince:{color:C.text2,fontFamily:F.m,fontSize:12,marginTop:4}, acctBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:10,paddingVertical:8,paddingHorizontal:14}, acctBtnText:{color:C.text,fontFamily:F.b,fontSize:13}, acctBtnDanger:{borderColor:'rgba(239,68,68,0.4)'},
  balPill:{backgroundColor:'rgba(34,197,94,0.12)',borderRadius:999,paddingHorizontal:18,paddingVertical:7,marginTop:10}, balPillText:{color:C.win,fontFamily:F.x,fontSize:13},
  stakeRow:{flexDirection:'row',marginTop:26}, stakeChip:{minWidth:64,alignItems:'center',paddingVertical:12,paddingHorizontal:18,marginHorizontal:6,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.card}, stakeChipOn:{borderColor:C.accent,backgroundColor:'rgba(108,99,255,0.10)'}, stakeChipText:{fontFamily:F.x,fontSize:18,color:C.text2}, stakeChipTextOn:{color:C.accent}, stakeHint:{color:C.text2,fontFamily:F.m,fontSize:11,letterSpacing:1,marginTop:8,textTransform:'uppercase'},
  confirmCard:{width:'100%',backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:18,padding:22,marginTop:26,alignItems:'center'}, confirmTitle:{fontFamily:F.b,fontSize:18,color:C.text}, confirmSub:{fontFamily:F.m,fontSize:13,color:C.text2,marginTop:8,textAlign:'center'},
  ledgerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.border}, ledgerLabel:{fontFamily:F.m,fontSize:13,color:C.text}, ledgerAmt:{fontFamily:F.x,fontSize:14},
  glossy:{borderRadius:36,paddingVertical:22,alignItems:'center',overflow:'hidden',shadowColor:'#000',shadowOpacity:0.4,shadowRadius:15,shadowOffset:{width:0,height:4},elevation:7},
  glossyHi:{position:'absolute',top:0,left:0,right:0,height:'50%',backgroundColor:'rgba(255,255,255,0.13)'}, glossyText:{color:'#fff',fontSize:22,fontFamily:F.k,letterSpacing:3},
  note:{color:C.text2,fontSize:12,marginTop:22,textAlign:'center',fontFamily:F.m},
  qcard:{backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14,marginTop:14,alignItems:'center',shadowColor:'#000',shadowOpacity:0.06,shadowRadius:10,shadowOffset:{width:0,height:2}},
  qimage:{width:'100%',height:200,borderRadius:8,backgroundColor:'rgba(108,99,255,0.04)'}, qtext:{fontSize:17,fontFamily:F.s,color:C.text,marginTop:12,textAlign:'center',lineHeight:23},
  scoreRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:8,marginBottom:10}, scoreSide:{flex:1,fontSize:12,color:C.text2,fontFamily:'Courier New'}, scoreStrong:{color:C.accent,fontFamily:'Courier New',fontWeight:'700'},
  miniRing:{width:52,height:52,alignItems:'center',justifyContent:'center',marginHorizontal:6}, miniRingTextWrap:{position:'absolute',alignItems:'center',justifyContent:'center'}, miniRingText:{fontSize:11,fontWeight:'700',fontVariant:['tabular-nums']},
  answerGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}, gridBtn:{width:'48.5%',borderWidth:1,borderRadius:12,paddingVertical:14,paddingHorizontal:12,marginBottom:8,alignItems:'center'}, gridBtnText:{fontSize:14,fontFamily:F.s,textAlign:'center'},
  revealLabel:{fontSize:12,color:C.text2,letterSpacing:2,fontFamily:F.s,textAlign:'center',marginTop:10}, revealAns:{fontSize:30,fontFamily:F.k,textAlign:'center',marginTop:6}, revealStatus:{fontSize:14,fontFamily:F.x,textAlign:'center',marginTop:4},
  revealDivider:{height:1,backgroundColor:C.border,marginVertical:22,marginHorizontal:40},
  raceLabel:{fontSize:11,color:C.text2,letterSpacing:2,fontFamily:F.b,textAlign:'center',marginBottom:12}, raceTimes:{flexDirection:'row',alignItems:'center',marginBottom:12}, raceName:{fontSize:10,color:C.text2,letterSpacing:0.5,fontFamily:F.b,marginBottom:3}, raceNum:{fontSize:24,fontFamily:F.k,fontVariant:['tabular-nums']}, raceVs:{fontSize:14,color:'#C7CDD9',fontFamily:F.k,marginHorizontal:8},
  barRow:{flexDirection:'row',height:6,marginTop:2}, barTrack:{flex:1,backgroundColor:C.border,borderRadius:3,overflow:'hidden',position:'relative',marginHorizontal:2}, barFillR:{position:'absolute',right:0,top:0,height:'100%',borderRadius:3}, barFillL:{position:'absolute',left:0,top:0,height:'100%',borderRadius:3}, gap:{textAlign:'center',marginTop:8,fontSize:10,fontFamily:F.s,color:C.text2},
  banner:{fontSize:24,fontFamily:F.k,letterSpacing:2,textAlign:'center',marginBottom:6},
  payAmount:{fontSize:30,fontFamily:F.k,textAlign:'center',marginTop:2}, payLabel:{fontSize:10,color:C.text2,textAlign:'center',marginTop:1,marginBottom:8,fontFamily:F.s},
  speedPill:{alignSelf:'center',borderWidth:1.5,borderRadius:999,paddingHorizontal:12,paddingVertical:4,marginBottom:10}, speedTxt:{fontSize:12,fontFamily:F.x,letterSpacing:1},
  resultCard:{backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,paddingVertical:4,paddingHorizontal:20,shadowColor:'#000',shadowOpacity:0.06,shadowRadius:10,shadowOffset:{width:0,height:2}},
  playerRow:{paddingVertical:10}, playerLabel:{fontSize:11,fontFamily:F.b,color:C.text2,letterSpacing:1,marginBottom:4}, playerData:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, playerAns:{fontSize:16,fontFamily:F.s,flexShrink:1,paddingRight:10}, playerTime:{fontSize:16,fontFamily:'Courier New',color:C.text,fontWeight:'600'},
  hDivider:{height:1,backgroundColor:C.border}, correctRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:10,paddingBottom:6}, correctLabel:{fontSize:13,color:C.text2,fontFamily:F.m}, correctValue:{fontSize:16,fontFamily:F.s,color:C.win,flexShrink:1,paddingLeft:10},
  statsRow:{flexDirection:'row',justifyContent:'center',marginTop:18,gap:32}, miniStat:{alignItems:'center'}, miniStatNum:{fontSize:24,fontFamily:F.k}, miniStatLabel:{fontSize:10,color:C.text2,letterSpacing:1,fontFamily:F.s,marginTop:2},
  ghost:{paddingVertical:14,alignItems:'center',marginTop:4}, ghostText:{color:C.text2,fontSize:15,fontFamily:F.b},
  screenTitle:{fontSize:28,fontFamily:F.k,color:C.text,marginBottom:18},
  statGrid:{flexDirection:'row',justifyContent:'space-between',marginBottom:12}, stat:{backgroundColor:C.card,borderRadius:16,paddingVertical:20,flex:1,marginHorizontal:4,alignItems:'center',shadowColor:'#000',shadowOpacity:0.06,shadowRadius:8,shadowOffset:{width:0,height:2}}, statVal:{fontSize:24,fontFamily:F.k,color:C.accent}, statLabel:{fontSize:12,color:C.text2,marginTop:4,fontFamily:F.m},
  toggleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:C.card,borderRadius:16,padding:18,marginTop:8}, toggleLabel:{fontSize:16,fontFamily:F.x,color:C.text}, toggle:{width:50,height:30,borderRadius:15,backgroundColor:'#D6D8E3',padding:3,justifyContent:'center'}, knob:{width:24,height:24,borderRadius:12,backgroundColor:'#fff'},
  nav:{position:'absolute',bottom:0,left:0,right:0,flexDirection:'row',backgroundColor:'rgba(255,255,255,0.95)',borderTopWidth:1,borderTopColor:C.border,paddingVertical:14,paddingBottom:28}, navBtn:{flex:1,alignItems:'center'}, navText:{fontSize:10,color:C.text2,fontFamily:F.s,marginTop:3,letterSpacing:0.3},
  waitMsg:{textAlign:'center',color:C.text2,fontFamily:F.m,fontSize:13,marginTop:6},
  waitTitle:{fontSize:26,fontFamily:F.k,color:C.text,textAlign:'center'}, waitSub:{fontSize:14,color:C.text2,fontFamily:F.m,marginTop:8,textAlign:'center'},
  cancelLink:{paddingVertical:12,paddingHorizontal:30,marginTop:6}, cancelText:{color:C.text2,fontSize:15,fontFamily:F.b},
  practiceLink:{marginTop:22,paddingVertical:8,paddingHorizontal:16}, practiceLinkText:{color:C.accent,fontFamily:F.b,fontSize:14},
  noticeText:{marginTop:18,color:C.lose,fontFamily:F.m,fontSize:13,textAlign:'center'},
  // play-screen pending actions
  pendingActions:{marginTop:14,alignItems:'center'}, pendingRow:{flexDirection:'row',justifyContent:'center',marginTop:10,gap:10},
  pendBtn:{paddingVertical:10,paddingHorizontal:22,borderRadius:12,borderWidth:1,borderColor:C.border,backgroundColor:C.card}, pendBtnText:{color:C.text2,fontFamily:F.b,fontSize:13},
  // background-result banners
  bannerWrap:{position:'absolute',top:54,left:14,right:14}, banner2:{backgroundColor:'rgba(255,255,255,0.97)',borderRadius:12,borderLeftWidth:4,paddingVertical:10,paddingHorizontal:14,marginBottom:8,shadowColor:'#000',shadowOpacity:0.12,shadowRadius:10,shadowOffset:{width:0,height:3},elevation:6,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, banner2Text:{color:C.text,fontFamily:F.x,fontSize:13}, banner2Tap:{color:C.text2,fontFamily:F.m,fontSize:11},
  rematchHint:{textAlign:'center',color:C.accent,fontFamily:F.b,fontSize:13,marginTop:4},
  // nav badge
  navBadge:{position:'absolute',top:-4,right:-8,minWidth:16,height:16,borderRadius:8,backgroundColor:C.lose,alignItems:'center',justifyContent:'center',paddingHorizontal:4}, navBadgeText:{color:'#fff',fontSize:10,fontFamily:F.x},
  // challenge
  codeBox:{backgroundColor:C.card,borderWidth:1,borderColor:C.accent,borderRadius:14,paddingVertical:16,paddingHorizontal:34,marginTop:16,marginBottom:6}, codeText:{fontSize:34,fontFamily:F.k,color:C.accent,letterSpacing:6,textAlign:'center'},
  waitRow:{alignItems:'center',marginTop:18},
  orRow:{flexDirection:'row',alignItems:'center',marginVertical:24}, orLine:{flex:1,height:1,backgroundColor:C.border}, orText:{color:C.text2,fontFamily:F.s,fontSize:11,letterSpacing:1,marginHorizontal:12},
  joinRow:{flexDirection:'row',alignItems:'center',gap:10,width:'100%'}, joinInput:{flex:1,minWidth:0,backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:12,paddingVertical:14,paddingHorizontal:16,fontFamily:F.s,fontSize:16,color:C.text}, joinBtn:{flexShrink:0,backgroundColor:C.accent,borderRadius:12,paddingVertical:14,paddingHorizontal:20}, joinBtnText:{color:'#fff',fontFamily:F.x,fontSize:15},
  // leaderboard
  segRow:{flexDirection:'row',backgroundColor:C.card,borderRadius:12,padding:4,marginBottom:12,borderWidth:1,borderColor:C.border}, seg:{flex:1,paddingVertical:9,alignItems:'center',borderRadius:9}, segOn:{backgroundColor:C.accent}, segText:{fontFamily:F.b,fontSize:14,color:C.text2}, segTextOn:{color:'#fff'},
  sortRow:{flexDirection:'row',alignItems:'center',marginBottom:12}, sortLabel:{color:C.text2,fontFamily:F.m,fontSize:12,marginRight:8}, sortBtn:{marginRight:14}, sortText:{color:C.text2,fontFamily:F.b,fontSize:13},
  lbTable:{backgroundColor:C.card,borderRadius:14,borderWidth:1,borderColor:C.border,overflow:'hidden'}, lbHead:{flexDirection:'row',paddingVertical:10,paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:C.border}, lbHeadText:{color:C.text2,fontFamily:F.b,fontSize:11}, lbRow:{flexDirection:'row',paddingVertical:11,paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:'rgba(0,0,0,0.04)',alignItems:'center'},
  lbCellRank:{width:24,fontFamily:F.b,fontSize:13,color:C.text}, lbCellName:{flex:1,fontFamily:F.s,fontSize:14,color:C.text,paddingRight:6}, lbCell:{width:30,textAlign:'center',fontFamily:F.s,fontSize:13,color:C.text}, lbCellNet:{width:64,textAlign:'right',fontFamily:F.s,fontSize:13},
  emptyText:{textAlign:'center',color:C.text2,fontFamily:F.m,fontSize:14,marginTop:40},
  // history
  sectionSub:{color:C.text2,fontFamily:F.b,fontSize:12,letterSpacing:1,marginBottom:8,textTransform:'uppercase'},
  histRow:{backgroundColor:C.card,borderRadius:12,borderWidth:1,borderColor:C.border,paddingVertical:11,paddingHorizontal:14,marginBottom:8}, histMain:{flexDirection:'row',alignItems:'center'}, badge:{borderRadius:6,paddingVertical:3,paddingHorizontal:8,marginRight:10}, badgeText:{fontFamily:F.x,fontSize:10,letterSpacing:0.5}, histOpp:{flex:1,fontFamily:F.s,fontSize:15,color:C.text},
  histCancel:{paddingVertical:6,paddingHorizontal:12,borderRadius:8,backgroundColor:'rgba(239,68,68,0.1)'}, histCancelText:{color:C.lose,fontFamily:F.b,fontSize:12},
  histDetails:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:8}, histDetail:{color:C.text2,fontFamily:F.m,fontSize:12},
  // profile
  profSection:{marginBottom:16}, profLabel:{color:C.text2,fontFamily:F.b,fontSize:12,letterSpacing:1,marginBottom:6,textTransform:'uppercase'}, profValue:{color:C.text,fontFamily:F.s,fontSize:16},
  gameIdLine:{textAlign:'center',color:C.text2,fontFamily:'Courier New',fontSize:11,marginTop:3,opacity:0.7},
  swipeHint:{textAlign:'center',color:C.text2,fontFamily:F.m,fontSize:11,marginTop:10,opacity:0.7},
  toastWrap:{position:'absolute',bottom:36,left:0,right:0,alignItems:'center'}, toast:{backgroundColor:'rgba(26,26,46,0.95)',borderRadius:12,paddingVertical:12,paddingHorizontal:20,maxWidth:'86%'}, toastText:{color:'#fff',fontFamily:F.s,fontSize:14,textAlign:'center'},
  authBox:{backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,padding:16,marginBottom:16},
  authInput:{backgroundColor:'#fff',borderWidth:1,borderColor:C.border,borderRadius:10,paddingVertical:12,paddingHorizontal:14,fontFamily:F.s,fontSize:15,color:C.text,marginTop:10},
  authBtn:{backgroundColor:C.accent,borderRadius:10,paddingVertical:13,alignItems:'center',marginTop:10}, authBtnText:{color:'#fff',fontFamily:F.x,fontSize:15},
  authLink:{paddingVertical:10,alignItems:'center'}, authLinkText:{color:C.text2,fontFamily:F.b,fontSize:13},
});




