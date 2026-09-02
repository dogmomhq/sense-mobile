// HARDENING 2026-09-02 (P2.3): ONE monotonic clock for everything that feeds the scored
// answer time. Date.now() is the time-of-day clock — the OS (or a player) can move it
// mid-round, which moves the measured time. performance.now() only counts forward.
// RULE: every timestamp that is ever subtracted from another round timestamp must come
// from here (countdown t0/handoff, round start, press stamp, ready-sent, drift). Display
// timestamps, expiry countdowns and anything compared to SERVER time stay on Date.now().
export const now = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
  ? performance.now() : Date.now();
