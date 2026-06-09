# Reskin preview — how to see the new screens (branch `reskin-ui`)

This branch adds the two pixel-locked screens from the design prototypes as
real React Native components. **Nothing in the live game flow changed** — the
new screens live in `screens/` and are only reachable through the preview
hook, so the app behaves exactly as before until we wire them in.

## See it on your phone (Expo Go)

1. On your computer, in the project folder:
   ```
   git fetch && git checkout reskin-ui
   npm install
   npx expo start
   ```
2. Scan the QR code with the Expo Go app on your phone.
3. The app opens normally. To view the new screens instead, open
   `screens/PreviewApp.js` and change `DEFAULT_SCREEN` to `'home'`,
   `'question'` (frozen at 6.0s) or `'question-live'` (ring burns 10 -> 0),
   then temporarily point `index.js` at it — or just ask Claude to flip it.

   Quickest manual flip: in `index.js`, change
   `App = require('./App').default;` to
   `App = require('./screens/PreviewApp').default;` and save — Expo reloads.

## See it in a browser

```
npx expo start --web
```
then open `http://localhost:8081/?reskin=home` or
`http://localhost:8081/?reskin=question&t=6`.

## What's in here

- `screens/theme.js` — colors, radii, fonts, and the width/1024 scale helper.
  Every dimension in these screens is the prototype's pixel value times that
  scale, so proportions are identical on any phone width.
- `screens/components/` — GlassHeader (glass slab + avatar + streak chip +
  balance pill), StakePill, TimerRing (laser-fuse ring + sparkler sprite),
  AnswerGrid (2x2 Anton buttons w/ pressed + locked states), SegmentedNav.
- `screens/HomeScreen.js`, `screens/QuestionScreen.js` — the composed screens.
- `assets/spark_sprite.png`, `assets/cheetah.jpeg`, `assets/avatar_demo.jpg`,
  Anton + JetBrains Mono fonts.
- `.github/workflows/reskin-snapshots.yml` + `snapshot-reskin.js` — CI job
  that renders both screens at the prototype's exact 1024x2224 canvas for
  pixel-diffing against the locked reference renders.

No new npm packages were added — everything uses dependencies already in the
app (react-native-svg, expo-linear-gradient, expo-font).

## Verification results (2026-06-09)

Rendered both screens in CI (expo web export + Playwright at the prototype's
exact 1024x2224 canvas) and pixel-diffed against the locked reference renders
(threshold 16/255), iterating 3 rounds of measured fixes:

- **Home vs `render_v56_withphoto.png`: 98.1% pixel match**
- **Question (frozen 6.0s) vs `ring_spritefuse_v5.png`: 96.4% pixel match**

Remaining differences, in order of size:
1. **Sparkler brightness** (question, ring head): the HTML prototype
   composites the spark sprite with `mix-blend-mode: screen`; React Native
   uses plain alpha (the approved approach). Shape/position/rotation match;
   the overlap with the photo is slightly less luminous.
2. **Sub-2px text antialiasing** on PLAY NOW / PRACTICE FREE / tier / answer
   glyphs — browser vs RN text rasterization, invisible at phone size.
3. **Glass blur**: the prototype's `backdrop-filter: blur(24px)` is
   approximated by the translucent fill (the photo behind the header is
   already heavily dimmed by the olive fade). Native blur (expo-blur) can be
   added later if wanted — kept out to avoid a new dependency.
4. Web render only: `react-native-web` is a close proxy. Real-device check in
   Expo Go is still the final word, especially for fonts and the 60fps ring.
