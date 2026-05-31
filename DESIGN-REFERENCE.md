# Sense web design — source of truth for the mobile faithful-match

## Tokens (from web App.css :root)
- bg page: #F0F0F3 + background.jpg (cover, center, fixed)
- accent: #6C63FF | accent-dark: #5A52E0 | accent-glow: rgba(108,99,255,0.25)
- win #22C55E | lose #EF4444 | draw #F59E0B
- text-primary: #1A1A2E | text-secondary: #6B7B94
- border: rgba(0,0,0,0.08)
- cards: rgba(255,255,255,0.95) + backdrop blur(12px), radius 16, shadow 0 2px 10px rgba(0,0,0,0.06)
- font: Inter (400–900)

## Signature components
- Glossy PLAY button: linear-gradient(180deg, #555 0%,#333 20%,#1a1a1a 45%,#111 55%,#0a0a0a 100%),
  radius 36, padding 22/48, font 22 weight 900, letter-spacing 3, UPPERCASE,
  shadow 0 4px 15px rgba(0,0,0,0.4) + inset top white highlight (::before 50% height white gradient)
- Connect (purple) button: linear-gradient(135deg, accent, accent-dark), radius 30
- Play-free button: transparent, 1.5px border rgba(100,140,180,0.25), radius 32

## Animations (@keyframes)
- countPulse 0.8s: scale 1.8->1->0.95 (3-2-1 countdown number)
- popIn 0.3s: scale 0.8->1 opacity 0->1 (result banner)
- cr* result reveal: confetti (crUpward/crGravity), shockwave (crSwExpand scale .1->5 fade),
  loss red-pulse (crRedPulse) + shake (crShake), flash (crFlashPop), time-race bar (cr-bar-fill width transition)
- spring easing used: cubic-bezier(0.34,1.56,0.64,1)
