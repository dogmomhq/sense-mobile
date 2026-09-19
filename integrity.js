// B210 (CJ 2026-09-18, DIY tier): device integrity for real-money surfaces.
//  - jail-monkey: jailbreak / hook / sandbox-escape heuristics (Cydia paths, writable system dirs, injected dylibs).
//    Not bulletproof — a determined person can hide one — but faking GPS on iOS essentially needs a jailbreak, so
//    this closes the cheap path. Positive → paid play + deposits refused, free play allowed, reported to the server.
//  - DeviceCheck: Apple's two per-device bits that survive reinstall; the server uses them for "this phone already
//    has a paid account". Token minted here, verified/updated server-side (needs the DeviceCheck key in Railway).
import { Platform } from 'react-native';
import { deviceCheckToken as _dcToken, DEVICECHECK_OK } from './modules/sense-devicecheck';

let JM = null; try { JM = require('jail-monkey').default || require('jail-monkey'); } catch (e) { JM = null; }
let cached = null;
export function deviceIntegrity() {
  if (cached) return cached;
  const reasons = [];
  try {
    if (JM && Platform.OS === 'ios') {
      if (JM.isJailBroken && JM.isJailBroken()) reasons.push('jailbroken');
      if (JM.hookDetected && JM.hookDetected()) reasons.push('hooked');
      if (JM.trustFall && JM.trustFall()) reasons.push('trustfall');
    }
  } catch (e) { reasons.push('check_error'); }
  cached = { tampered: reasons.some((r) => r !== 'check_error'), reasons, checked: !!JM };
  return cached;
}
export const TAMPER_MSG = 'This device can’t be used for real-money play. Free play still works.';
export { DEVICECHECK_OK };
export async function deviceCheckToken() { return _dcToken(); }
