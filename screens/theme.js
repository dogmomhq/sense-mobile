// ── Sense reskin design tokens ──────────────────────────────────────────────
// 1:1 port of the locked prototypes:
//   Home:     sense/v11_locked/sense_ui_proto/index.html (locked v56)
//   Question: sense/anim_gallery/question_ring_demo.html (fuse ring)
// Every dimension in screens/ is written in PROTOTYPE PIXELS (1024 x 2224
// canvas) and multiplied by s = deviceWidth / 1024 at render time, so the
// proportions are exact on any device width.
import { useWindowDimensions } from 'react-native';
import { useFonts } from 'expo-font';

// Global perf valve for older devices (flip to true to halve particle work:
// fuse sparks 72 -> 36, win confetti 120 -> 60, win ray burst off). Default
// false = full visuals; all paths are exercised either way.
export const REDUCED_FX = false;

export const BASE_W = 1024;
export const BASE_H = 2224;

export const COLORS = {
  lime: '#D4F23C',
  limeGlow: 'rgba(215,248,74,0.45)',
  cream: '#F5F1E6',
  creamDim: 'rgba(245,241,230,0.7)',
  forest: '#0B0F0A',
  mossDark: '#1A2418',
  flameOut: '#FF8228',
  flameIn: '#FFDC50',
  wordmark: '#EDE2C5',
  // surfaces
  chipBg: 'rgba(42,40,26,0.80)',        // streak chip + balance pill fill
  glassBg: 'rgba(28,38,26,0.55)',       // header glass slab
  glassBorder: 'rgba(215,248,74,0.45)', // lime line on the glass slab
  tierBg: 'rgba(27,32,22,0.95)',
  tierBorder: 'rgba(215,248,74,0.4)',
  navBg: 'rgba(18,24,16,0.85)',
  navBorder: 'rgba(245,241,230,0.14)',
  navLabel: 'rgba(245,241,230,0.88)',
  ansBg: 'rgba(16,20,13,0.82)',
  ansBorder: 'rgba(215,248,74,0.55)',
  ansPressedBg: 'rgba(212,242,60,0.18)',
  stakeBg: 'rgba(20,24,16,0.78)',
  stakeBorder: 'rgba(215,248,74,0.5)',
  ghostBorder: 'rgba(235,228,205,0.95)',
  // fuse-ring palette
  burntGlow: 'rgba(225,228,218,0.18)',  // spent-fuse soft layer
  burntCore: 'rgba(225,228,218,0.40)',  // spent-fuse crisp layer
  fuseCore: '#F4FFC8',                  // white-hot laser core
  emberOuter: 'rgba(255,190,80,0.55)',  // fuse head ember
  white: '#FFFFFF',
  black: '#000000',
};

// border radii (prototype px — multiply by s)
export const RADII = {
  glass: 32, chip: 22, cta: 36, ghost: 18,
  tier: 14, nav: 20, answer: 24, stake: 40,
};

export const FONTS = {
  anton: 'Anton_400Regular',        // wordmark, streak number, answer text
  mono: 'JetBrainsMono_700Bold',    // timer digits
  interMedium: 'Inter_500Medium',
  interSemi: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  interExtra: 'Inter_800ExtraBold',
  interBlack: 'Inter_900Black',
};

// scale: deviceWidth / 1024 — every prototype dimension multiplies by this
export function useScale() {
  const { width } = useWindowDimensions();
  return width / BASE_W;
}

// Load every font the two screens use (same local-TTF pattern as App.js).
export function useSenseFonts() {
  const [loaded] = useFonts({
    Anton_400Regular: require('../assets/fonts/Anton-Regular.ttf'),
    JetBrainsMono_700Bold: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
    Inter_500Medium: require('../assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('../assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('../assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('../assets/fonts/Inter_800ExtraBold.ttf'),
    Inter_900Black: require('../assets/fonts/Inter_900Black.ttf'),
  });
  return loaded;
}

// ── Height-aware vertical layout (2026-06-12 responsive fix) ────────────────
// Real phones are proportionally SHORTER than the 1024x2224 design canvas
// (Safari URL bar etc), so fixed design-Y placement pushes bottom content
// under the nav. vs compresses vertical POSITIONS (sizes stay width-scaled);
// g compresses GAPS faster than vs so spacing absorbs shrink first. On a
// proportional (tall) canvas vs = g = 1 and every screen renders the exact
// locked design.
import { Platform } from 'react-native';

let _safeBottom = null;
export function getSafeBottom() {
  if (_safeBottom != null) return _safeBottom;
  _safeBottom = 0;
  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
    try { // probe env(safe-area-inset-bottom) — returns 0 unless viewport-fit=cover
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:0;width:0;pointer-events:none;height:env(safe-area-inset-bottom,0px);';
      document.body.appendChild(el);
      _safeBottom = el.getBoundingClientRect().height || 0;
      el.remove();
    } catch (e) { _safeBottom = 0; }
  }
  return _safeBottom;
}

export function useVScale() {
  const { width, height } = useWindowDimensions();
  const s = width / BASE_W;
  const designH = BASE_H * s;
  const vs = Math.min(1, height / designH);
  const g = vs >= 1 ? 1 : Math.max(0.3, 1 - (1 - vs) * 1.6);
  return { s, vs, g, width, height, safeB: getSafeBottom() };
}
