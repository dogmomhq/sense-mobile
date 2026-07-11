// ── RESKIN SFX + HAPTICS (Phase 6) ──────────────────────────────────────────
// 8 local procedural sounds (scripts/gen-sfx.js, CC0 — we synthesized them).
// Gated by the SAME Sound toggle as the legacy playSfx: App.js calls
// setSfxEnabled(sound) whenever the toggle flips. DEFAULT ON (1c, 2026-07-10).
// Native: expo-audio players. Web export: HTMLAudio fallback (guarded).
// Haptics: native only (expo-haptics), no-op on web. Every call is try/catch —
// audio/haptics must never break the game loop.
import { Platform } from 'react-native';

const SRC = {
  countdown_beat: require('../assets/sounds/countdown_beat.wav'),
  go: require('../assets/sounds/go.wav'),
  correct: require('../assets/sounds/correct.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  race_finish: require('../assets/sounds/race_finish.wav'),
  win: require('../assets/sounds/win.wav'),
  heartbeat: require('../assets/sounds/heartbeat.wav'),
  payout: require('../assets/sounds/payout.wav'),
};

let enabled = false;          // mirrors the Profile Sound toggle (App.js syncs on mount)
let players = null;           // lazy-built on first enable

export function setSfxEnabled(on) {
  enabled = !!on;
  if (enabled && !players) initPlayers();
}

function initPlayers() {
  players = {};
  try {
    if (Platform.OS === 'web') {
      // HTMLAudio fallback — resolve module → URL via expo-asset (web-safe)
      if (typeof Audio === 'undefined') { players = {}; return; }
      const { Asset } = require('expo-asset');
      for (const [k, mod] of Object.entries(SRC)) {
        try {
          const uri = Asset.fromModule(mod).uri;
          const a = new Audio(uri); a.preload = 'auto';
          players[k] = { play: () => { try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {} } };
        } catch (e) {}
      }
    } else {
      const { createAudioPlayer } = require('expo-audio');
      for (const [k, mod] of Object.entries(SRC)) {
        try {
          const p = createAudioPlayer(mod);
          players[k] = { play: () => { try { p.seekTo(0); p.play(); } catch (e) {} } };
        } catch (e) {}
      }
    }
  } catch (e) { players = {}; }
}

export function sfx(name) {
  if (!enabled) return;
  if (!players) initPlayers();
  const p = players && players[name];
  if (p) p.play();
}

// ── haptics (native only; web no-ops) ──────────────────────────────────────
let H = null;
function haptics() {
  if (Platform.OS === 'web') return null;
  if (!H) { try { H = require('expo-haptics'); } catch (e) { H = null; } }
  return H;
}
export function hapTap(style /* 'light'|'medium'|'heavy'|'rigid' */) {
  const h = haptics(); if (!h) return;
  const map = { light: h.ImpactFeedbackStyle.Light, medium: h.ImpactFeedbackStyle.Medium,
    heavy: h.ImpactFeedbackStyle.Heavy, rigid: h.ImpactFeedbackStyle.Rigid || h.ImpactFeedbackStyle.Heavy };
  try { h.impactAsync(map[style] || h.ImpactFeedbackStyle.Medium); } catch (e) {}
}
// double-tap "heartbeat" (lub @0, dub @140ms — matches the legacy near-miss hook)
export function hapHeartbeat() {
  hapTap('medium');
  setTimeout(() => hapTap('light'), 140);
}
