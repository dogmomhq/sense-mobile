import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ImageBackground, Pressable, StyleSheet, SafeAreaView, StatusBar, ScrollView, Animated, Easing } from 'react-native';
import Svg, { Circle, Polygon, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black } from '@expo-google-fonts/inter';
import { getPracticeQuestion, getComputerAnswer, determinePracticeResult, formatTime, generatePlayerName } from './gameEngine.js';

const TIME_LIMIT = 10000;
const C = { accent:'#6C63FF', win:'#22C55E', lose:'#EF4444', draw:'#F59E0B', text:'#1A1A2E', text2:'#6B7B94', border:'rgba(0,0,0,0.08)', card:'rgba(255,255,255,0.95)', page:'#F0F0F3' };
const F = { r:'Inter_400Regular', m:'Inter_500Medium', s:'Inter_600SemiBold', b:'Inter_700Bold', x:'Inter_800ExtraBold', k:'Inter_900Black' };
const BG = 'https://dogmomhq.github.io/sense-react-staging/app/assets/background.jpg';
const CIRC54 = 2 * Math.PI * 54;
function hap(style) { try { Haptics.impactAsync(style); } catch (e) {} }

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

// Stage 1 — upward burst from center (web .cr-confetti-up). Tuned to match web's RENDERED size/spread on device.
function PUp({ color, delay }) {
  const t = useRef(new Animated.Value(0)).current;
  const dx = useRef((Math.random()-0.5)*300).current, dy = useRef(-(95+Math.random()*230)).current;
  const rot = useRef(Math.random()*900-450).current, sz = useRef(4+Math.random()*6).current, round = useRef(Math.random()>0.4).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:600+Math.random()*500,delay,useNativeDriver:true}).start(); }, []);
  const translateX = t.interpolate({inputRange:[0,1],outputRange:[0,dx]});
  const translateY = t.interpolate({inputRange:[0,1],outputRange:[0,dy]});
  const opacity = t.interpolate({inputRange:[0,0.6,1],outputRange:[1,1,0]});
  const scale = t.interpolate({inputRange:[0,1],outputRange:[1,0.3]});
  const rotate = t.interpolate({inputRange:[0,1],outputRange:['0deg',rot+'deg']});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', left:'50%', top:'50%', width:sz, height:sz*0.6, backgroundColor:color, borderRadius:round?sz:1, opacity, transform:[{translateX},{translateY},{scale},{rotate}] }} />;
}
// Stage 2 — gravity rain from upper area, spawned after the burst (web .cr-confetti-gravity)
function PFall({ color, delay }) {
  const t = useRef(new Animated.Value(0)).current;
  const x0 = useRef(30+Math.random()*40).current, y0 = useRef(12+Math.random()*18).current;
  const dx = useRef((Math.random()-0.5)*220).current, dy = useRef(110+Math.random()*180).current;
  const rot = useRef(Math.random()*360).current, sz = useRef(4+Math.random()*6).current, round = useRef(Math.random()>0.4).current;
  useEffect(() => { Animated.timing(t,{toValue:1,duration:800+Math.random()*500,delay,useNativeDriver:true}).start(); }, []);
  const translateX = t.interpolate({inputRange:[0,1],outputRange:[0,dx]});
  const translateY = t.interpolate({inputRange:[0,1],outputRange:[0,dy]});
  const opacity = t.interpolate({inputRange:[0,1],outputRange:[1,0]});
  const rotate = t.interpolate({inputRange:[0,1],outputRange:['0deg',rot+'deg']});
  return <Animated.View pointerEvents="none" style={{ position:'absolute', left:x0+'%', top:y0+'%', width:sz, height:sz*0.6, backgroundColor:color, borderRadius:round?sz:1, opacity, transform:[{translateX},{translateY},{rotate}] }} />;
}
function Confetti({ type }) {
  const pal = { win:['#22C55E','#6C63FF','#F59E0B','#00D4AA','#fff','#34D399','#A78BFA','#EC4899'], loss:['#EF4444','#991B1B','#7F1D1D','#6B7B94'], draw:['#F59E0B','#FBBF24','#6B7B94','#ddd','#fff'] };
  const colors = pal[type] || pal.draw, n = type==='win'?100:type==='draw'?35:20;
  // two stages like web: an up-burst AND a delayed gravity rain (~2x particles = more juice)
  const ups = useRef([...Array(n)].map((_,i)=>({color:colors[i%colors.length],delay:Math.random()*100}))).current;
  const falls = useRef([...Array(n)].map((_,i)=>({color:colors[i%colors.length],delay:380+Math.random()*340}))).current;
  return <>{ups.map((p,i)=><PUp key={'u'+i} {...p} />)}{falls.map((p,i)=><PFall key={'f'+i} {...p} />)}</>;
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
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black });
  const [tab, setTab] = useState('home');
  const [mode, setMode] = useState(null);
  const [countdown, setCountdown] = useState(false);
  const [rec, setRec] = useState({ wins:0, losses:0, draws:0 });
  const [sound, setSound] = useState(false);
  const [q, setQ] = useState(null);
  const [used, setUsed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [comp, setComp] = useState(null);
  const [oppName, setOppName] = useState('Rival');
  const history = useRef([]); const startRef = useRef(0); const timerRef = useRef(null); const answered = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;

  // Persist practice stats (web saves to localStorage; mobile uses AsyncStorage)
  useEffect(() => { (async () => { try { const r = await AsyncStorage.getItem('sense_rec'); if (r) setRec(JSON.parse(r)); const h = await AsyncStorage.getItem('sense_hist'); if (h) history.current = JSON.parse(h); } catch (e) {} })(); }, []);
  useEffect(() => { try { AsyncStorage.setItem('sense_rec', JSON.stringify(rec)); } catch (e) {} }, [rec]);

  function fadeTo(next) { Animated.timing(fade,{toValue:0,duration:120,useNativeDriver:true}).start(); setTimeout(()=>{ next(); fade.setValue(0); Animated.timing(fade,{toValue:1,duration:150,useNativeDriver:true}).start(); },130); }

  useEffect(() => {
    if (mode !== 'play' || !q || countdown) return;
    answered.current = false; startRef.current = Date.now(); setElapsed(0);
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
  function startRound(f) { setOppName(generatePlayerName()); try { Image.prefetch(f.image); } catch(e){} setQ(f); setPicked(null); setResult(null); setComp(null); setCountdown(true); fadeTo(() => setMode('play')); }
  function startPractice() { const f = getPracticeQuestion(used); recordUsed(f.questionIdx); startRound(f); }
  function submit(idx) {
    if (answered.current) return; answered.current = true; clearInterval(timerRef.current);
    const playerTime = idx === -1 ? TIME_LIMIT : Math.min(Date.now()-startRef.current, TIME_LIMIT);
    setPicked(idx);
    const c = getComputerAnswer(q.correctIdx, q.options.length, history.current);
    const r = determinePracticeResult(idx, playerTime, c.answer, c.time, q.correctIdx);
    setComp({ ...c, playerTime }); setResult(r);
    history.current = [...history.current, r.result === 'win'];
    try { AsyncStorage.setItem('sense_hist', JSON.stringify(history.current)); } catch (e) {}
    setRec(p => ({ wins:p.wins+(r.result==='win'), losses:p.losses+(r.result==='loss'), draws:p.draws+(r.result==='draw') }));
    setTimeout(() => fadeTo(() => setMode('results')), 800);
  }
  function playAgain() { const f = getPracticeQuestion(used); recordUsed(f.questionIdx); startRound(f); }
  function goHome() { fadeTo(() => { setMode(null); setTab('home'); }); }

  if (!fontsLoaded) return <View style={{ flex:1, backgroundColor:C.page }} />;

  let body;
  if (mode === 'play' && q) {
    const secLeft = Math.max(0, (TIME_LIMIT-elapsed)/1000), progress = Math.min(elapsed/TIME_LIMIT,1);
    const ringColor = secLeft<=3 ? C.lose : secLeft<=5 ? C.draw : C.accent;
    const ans = picked !== null;
    const ringText = ans ? (comp ? formatTime(Math.min(comp.playerTime,TIME_LIMIT)) : '—') : secLeft.toFixed(1);
    const youText = ans ? (picked===-1 ? '—' : formatTime(Math.min(comp.playerTime,TIME_LIMIT))) : formatTime(elapsed);
    const themText = ans && comp ? (comp.isCorrect ? formatTime(comp.time) : 'Wrong') : '—';
    body = (<>
      <View style={st.playHeader}><Text style={st.pnameSm}>You</Text><Text style={st.vsTiny}>vs</Text><Text style={st.pnameSm} numberOfLines={1}>{oppName||'Rival'}</Text></View>
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
    </>);
  } else if (mode === 'results' && result) {
    const win = result.result==='win', draw = result.result==='draw';
    const color = win ? C.win : draw ? C.draw : C.lose;
    const myCorrect = picked === q.correctIdx, oppCorrect = comp.isCorrect;
    const banner = pickBanner(result.result, myCorrect, oppCorrect, comp.playerTime, oppCorrect?comp.time:null);
    const ctype = win ? 'win' : draw ? 'draw' : 'loss';
    body = (<ResultsView {...{win, draw, color, banner, ctype, myCorrect, oppCorrect, reason: result.reason, q, comp, picked, rec, oppName, playAgain, goHome}} />);
  } else {
    const played = rec.wins+rec.losses+rec.draws, acc = played ? Math.round(rec.wins/played*100) : 0;
    body = (<>
      <ScrollView contentContainerStyle={{flexGrow:1,paddingBottom:96}}>
        {tab === 'home' ? (
          <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingTop:70}}>
            <Text style={st.bigBrand}>SENSE</Text>
            <Text style={st.tagline}>How fast can you name the animal?</Text>
            <View style={st.recPill}><Text style={st.recPillText}>{rec.wins}W · {rec.losses}L · {rec.draws}D</Text></View>
            <View style={{height:30}} />
            <View style={{width:'100%',alignItems:'center'}}><GlossyButton label="RUN IT BACK" onPress={startPractice} /></View>
            <Text style={st.note}>Free practice vs the computer. No wager.</Text>
          </View>
        ) : (
          <View style={{paddingTop:48}}>
            <Text style={st.screenTitle}>Profile</Text>
            <View style={st.statGrid}><Stat label="Played" value={played} /><Stat label="Wins" value={rec.wins} /><Stat label="Accuracy" value={acc+'%'} /></View>
            <View style={st.statGrid}><Stat label="Losses" value={rec.losses} /><Stat label="Draws" value={rec.draws} /><Stat label="Streak" value={streak(history.current)} /></View>
            <Pressable style={st.toggleRow} onPress={()=>setSound(x=>!x)}><Text style={st.toggleLabel}>Sound</Text><View style={[st.toggle,sound&&{backgroundColor:C.accent}]}><View style={[st.knob,sound&&{alignSelf:'flex-end'}]} /></View></Pressable>
          </View>
        )}
      </ScrollView>
      <View style={st.nav}><NavBtn label="Play" icon="play" active={tab==='home'} onPress={()=>setTab('home')} /><NavBtn label="Profile" icon="profile" active={tab==='profile'} onPress={()=>setTab('profile')} /></View>
    </>);
  }

  return (<ImageBackground source={{uri:BG}} resizeMode="cover" style={{flex:1,backgroundColor:C.page}}>
    <StatusBar barStyle="dark-content" />
    <Animated.View style={{flex:1,opacity:fade}}><SafeAreaView style={{flex:1,paddingHorizontal:22}}>{body}</SafeAreaView></Animated.View>
    {countdown && mode==='play' && <Countdown onDone={()=>setCountdown(false)} />}
  </ImageBackground>);
}

function ResultsView({ win, draw, color, banner, ctype, myCorrect, oppCorrect, reason, q, comp, picked, rec, oppName, playAgain, goHome }) {
  const both = myCorrect && oppCorrect;
  const [step, setStep] = useState('reveal'); const [oppRevealed, setOppRevealed] = useState(false);
  const [youStamp, setYouStamp] = useState(false); const [oppStamp, setOppStamp] = useState(false);
  const youA = useRef(new Animated.Value(0)).current, oppA = useRef(new Animated.Value(0)).current, bannerA = useRef(new Animated.Value(0)).current;
  const cardA = useRef(new Animated.Value(0)).current, btnsA = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const timers = useRef([]);
  const myAns = picked === -1 ? 'Timed out' : q.options[picked];
  const oppAns = oppCorrect ? q.options[q.correctIdx] : 'Wrong';
  const payoutText = win ? '✓ Correct' : draw ? '—' : reason === 'slower' ? '⏱ Too Slow' : '✗ Wrong';

  function explode() {
    setStep('explode'); hap(win?Haptics.ImpactFeedbackStyle.Heavy:Haptics.ImpactFeedbackStyle.Medium);
    bannerA.setValue(0); cardA.setValue(0); btnsA.setValue(0);
    // web doExplosion: burst fires first; banner springs in at +180ms, card fades +0.4s after it, buttons at +980ms
    Animated.timing(bannerA,{toValue:1,duration:350,delay:180,easing:Easing.bezier(0.34,1.56,0.64,1),useNativeDriver:true}).start();
    Animated.timing(cardA,{toValue:1,duration:400,delay:580,easing:Easing.bezier(0,0,0.2,1),useNativeDriver:true}).start();
    Animated.timing(btnsA,{toValue:1,duration:300,delay:980,easing:Easing.out(Easing.ease),useNativeDriver:true}).start();
    timers.current.push(setTimeout(()=>setReady(true), 980));
  }

  useEffect(() => {
    const t=(fn,ms)=>{ const id=setTimeout(fn,ms); timers.current.push(id); return id; };
    t(()=>{ Animated.timing(youA,{toValue:1,duration:400,easing:Easing.bezier(0,0,0.2,1),useNativeDriver:true}).start(); hap(myCorrect?Haptics.ImpactFeedbackStyle.Light:Haptics.ImpactFeedbackStyle.Medium); if(!myCorrect) t(()=>setYouStamp(true),400); }, 200);
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
      <Shockwave color={color} />
      {win && <Shockwave color={C.accent} delay={100} />}
      {win && <Shockwave color={C.draw} delay={200} />}
      {!win && !draw && <RedPulse />}
      <Confetti type={ctype} />
      <View style={{flex:1,justifyContent:'center'}}>
        <Animated.Text style={[st.banner,{ color, opacity:bannerA, transform:[{translateY:bTy},{scale:bScale}] }]}>{banner}</Animated.Text>
        <Animated.View style={{ opacity:cardA, transform:[{translateY:cardA.interpolate({inputRange:[0,1],outputRange:[16,0]})}] }}>
        <Text style={[st.payAmount,{color}]} numberOfLines={1}>{payoutText}</Text>
        <Text style={st.payLabel}>Practice Mode</Text>
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
        <View style={{ width:'100%', alignItems:'center', marginTop:18 }}><GlossyButton label="RUN IT BACK" onPress={playAgain} small /></View>
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
function NavIcon({ type, color }){ return (<Svg width={22} height={22} viewBox="0 0 24 24" fill={color}>{type==='play' ? <Polygon points="6 3 20 12 6 21" /> : <><Circle cx={12} cy={8} r={4.5} /><Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8H4z" /></>}</Svg>); }
function NavBtn({ label, icon, active, onPress }){ const c = active?C.accent:C.text2; return (<Pressable style={st.navBtn} onPress={onPress}><NavIcon type={icon} color={c} /><Text style={[st.navText,{color:c}, active&&{fontFamily:F.x}]}>{label}</Text></Pressable>); }

const st = StyleSheet.create({
  playHeader:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,marginTop:14}, pnameSm:{fontSize:11,color:C.text2,fontFamily:'Courier New'}, vsTiny:{fontSize:8,color:C.text2,opacity:0.4,letterSpacing:1,textTransform:'uppercase'},
  bigBrand:{fontSize:56,fontFamily:F.k,letterSpacing:7,color:C.accent}, tagline:{fontSize:15,color:C.text2,marginTop:14,textAlign:'center',fontFamily:F.m},
  recPill:{backgroundColor:'rgba(108,99,255,0.10)',borderRadius:999,paddingHorizontal:20,paddingVertical:9,marginTop:22}, recPillText:{color:C.accent,fontFamily:F.x,fontSize:14},
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
  resultCard:{backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,paddingVertical:4,paddingHorizontal:20,shadowColor:'#000',shadowOpacity:0.06,shadowRadius:10,shadowOffset:{width:0,height:2}},
  playerRow:{paddingVertical:10}, playerLabel:{fontSize:11,fontFamily:F.b,color:C.text2,letterSpacing:1,marginBottom:4}, playerData:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, playerAns:{fontSize:16,fontFamily:F.s,flexShrink:1,paddingRight:10}, playerTime:{fontSize:16,fontFamily:'Courier New',color:C.text,fontWeight:'600'},
  hDivider:{height:1,backgroundColor:C.border}, correctRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:10,paddingBottom:6}, correctLabel:{fontSize:13,color:C.text2,fontFamily:F.m}, correctValue:{fontSize:16,fontFamily:F.s,color:C.win,flexShrink:1,paddingLeft:10},
  statsRow:{flexDirection:'row',justifyContent:'center',marginTop:18,gap:32}, miniStat:{alignItems:'center'}, miniStatNum:{fontSize:24,fontFamily:F.k}, miniStatLabel:{fontSize:10,color:C.text2,letterSpacing:1,fontFamily:F.s,marginTop:2},
  ghost:{paddingVertical:14,alignItems:'center',marginTop:4}, ghostText:{color:C.text2,fontSize:15,fontFamily:F.b},
  screenTitle:{fontSize:28,fontFamily:F.k,color:C.text,marginBottom:18},
  statGrid:{flexDirection:'row',justifyContent:'space-between',marginBottom:12}, stat:{backgroundColor:C.card,borderRadius:16,paddingVertical:20,flex:1,marginHorizontal:4,alignItems:'center',shadowColor:'#000',shadowOpacity:0.06,shadowRadius:8,shadowOffset:{width:0,height:2}}, statVal:{fontSize:24,fontFamily:F.k,color:C.accent}, statLabel:{fontSize:12,color:C.text2,marginTop:4,fontFamily:F.m},
  toggleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:C.card,borderRadius:16,padding:18,marginTop:8}, toggleLabel:{fontSize:16,fontFamily:F.x,color:C.text}, toggle:{width:50,height:30,borderRadius:15,backgroundColor:'#D6D8E3',padding:3,justifyContent:'center'}, knob:{width:24,height:24,borderRadius:12,backgroundColor:'#fff'},
  nav:{position:'absolute',bottom:0,left:0,right:0,flexDirection:'row',backgroundColor:'rgba(255,255,255,0.95)',borderTopWidth:1,borderTopColor:C.border,paddingVertical:14,paddingBottom:28}, navBtn:{flex:1,alignItems:'center'}, navText:{fontSize:10,color:C.text2,fontFamily:F.s,marginTop:3,letterSpacing:0.3},
});
