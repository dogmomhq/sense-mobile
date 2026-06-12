// ── SFX generator: 8 procedural CC0 sounds → assets/sounds/*.wav ────────────
// Pure-node DSP (no deps). 32kHz mono 16-bit, every file < 100KB.
// Re-run: node scripts/gen-sfx.js   (deterministic — same bytes every time)
const fs = require('fs'), path = require('path');
const SR = 32000;
let seed = 1337; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;

function wav(samples) {
  const n = samples.length, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32767 | 0, i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  return Buffer.concat([h, data]);
}
const buf = (sec) => new Float32Array(Math.round(SR * sec));
const env = (t, a, d) => t < a ? t / a : Math.exp(-(t - a) / d);          // attack/exp-decay
const sat = (x, k = 1.5) => Math.tanh(x * k);                              // soft clip
// sine sweep with exponential pitch drop f0→f1 over `gl` seconds
function sweep(out, t0, dur, f0, f1, gl, amp, dec, a = 0.002) {
  let ph = 0;
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / gl);
    ph += 2 * Math.PI * f / SR;
    const j = Math.round((t0 + t) * SR); if (j >= out.length) break;
    out[j] += Math.sin(ph) * amp * env(t, a, dec);
  }
}
function tone(out, t0, dur, f, amp, dec, a = 0.002, fm = 0) {
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR, j = Math.round((t0 + t) * SR); if (j >= out.length) break;
    out[j] += Math.sin(2 * Math.PI * f * t + fm * Math.sin(2 * Math.PI * f * 2.01 * t)) * amp * env(t, a, dec);
  }
}
// filtered noise burst (lp = one-pole lowpass coeff 0..1, 1 = white)
function noise(out, t0, dur, amp, dec, lp = 1, hp = 0) {
  let y = 0, py = 0, px = 0;
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR, j = Math.round((t0 + t) * SR); if (j >= out.length) break;
    const x = rnd(); y += lp * (x - y);                 // lowpass
    let v = y;
    if (hp) { v = y - px + hp * py; px = y; py = v; }   // crude highpass
    out[j] += v * amp * env(t, 0.001, dec);
  }
}
const norm = (b, peak = 0.92) => { let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < b.length; i++) b[i] = sat(b[i] / m) * peak; return b; };

const out = {};
// 1. countdown_beat — low tom: 165→72Hz drop + skin noise tick
{ const b = buf(0.34); sweep(b, 0, 0.30, 165, 72, 0.045, 0.9, 0.09); noise(b, 0, 0.03, 0.25, 0.012, 0.35); out.countdown_beat = b; }
// 2. go — whipcrack + bass hit: bright noise snap over a 95→38Hz punch
{ const b = buf(0.45); noise(b, 0, 0.06, 0.8, 0.018, 1, 0.6); sweep(b, 0.005, 0.40, 95, 38, 0.05, 1.0, 0.13); out.go = b; }
// 3. correct — bright pop + two-tone coin (B5→E6)
{ const b = buf(0.5); sweep(b, 0, 0.06, 700, 1050, 0.02, 0.5, 0.025);
  tone(b, 0.05, 0.12, 1244, 0.45, 0.05, 0.001, 0.4); tone(b, 0.14, 0.32, 1661, 0.5, 0.12, 0.001, 0.4);
  tone(b, 0.14, 0.32, 3322, 0.12, 0.10); out.correct = b; }
// 4. wrong — dull thud: dark noise + 120→55Hz drop, fast die
{ const b = buf(0.35); noise(b, 0, 0.10, 0.5, 0.035, 0.12); sweep(b, 0, 0.30, 120, 55, 0.04, 0.8, 0.08); out.wrong = b; }
// 5. race_finish — ding over boom: bell partials + 70Hz floor hit
{ const b = buf(0.85); sweep(b, 0, 0.5, 80, 48, 0.06, 0.8, 0.16); noise(b, 0, 0.08, 0.35, 0.03, 0.25);
  tone(b, 0.02, 0.8, 1318, 0.5, 0.28, 0.001, 0.25); tone(b, 0.02, 0.6, 1976, 0.22, 0.18); tone(b, 0.02, 0.5, 2637, 0.12, 0.12); out.race_finish = b; }
// 6. win — bass drop hit: 150→32Hz saturated drop + sub bloom + air
{ const b = buf(1.0); sweep(b, 0, 0.9, 150, 32, 0.10, 1.1, 0.30); noise(b, 0, 0.05, 0.5, 0.02, 1, 0.5);
  tone(b, 0.10, 0.8, 49, 0.5, 0.30, 0.02); noise(b, 0.02, 0.5, 0.10, 0.20, 0.08); out.win = b; }
// 7. heartbeat — double thump (lub @0, dub @180ms), dark and soft
{ const b = buf(0.55); sweep(b, 0, 0.16, 95, 55, 0.03, 0.9, 0.045); sweep(b, 0.18, 0.16, 88, 52, 0.03, 0.75, 0.04); out.heartbeat = b; }
// 8. payout — soft kaching: muted coin arpeggio + shimmer tail
{ const b = buf(0.8); const ns = [1046, 1318, 1568];
  ns.forEach((f, i) => { tone(b, i * 0.07, 0.30, f, 0.35, 0.10, 0.002, 0.3); tone(b, i * 0.07, 0.25, f * 2, 0.10, 0.07); });
  tone(b, 0.21, 0.55, 2093, 0.18, 0.20); noise(b, 0.21, 0.35, 0.05, 0.15, 0.04); out.payout = b; }

const dir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });
for (const [name, b] of Object.entries(out)) {
  const f = path.join(dir, name + '.wav');
  fs.writeFileSync(f, wav(norm(b)));
  console.log(name + '.wav', fs.statSync(f).size, 'bytes');
}
