// sealed.js — B200 (SEALED-CLIP-SPEC-2026-09-13). The paid clip arrives during the countdown ENCRYPTED; the
// server sends the key at GO. Decrypt is native (react-native-quick-crypto, AES-128-CTR). On a build without
// the native module (Expo Go, an OTA onto an older native build) SEALED_OK is false, the app tells the server
// so in its queue message, and the server serves plain clips exactly as before. Nothing else changes.
import * as FileSystem from 'expo-file-system/legacy';
let QC = null;
try { QC = require('react-native-quick-crypto'); if (!QC || typeof QC.createDecipheriv !== 'function') QC = null; } catch (e) { QC = null; }
export const SEALED_OK = !!QC;

// base64 <-> bytes without the JS Buffer polyfill (quick-base64 is native and ships with quick-crypto)
let b64 = null; try { b64 = require('react-native-quick-base64'); } catch (e) { b64 = null; }
function fromB64(s) { return b64 ? new Uint8Array(b64.toByteArray(s)) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
function toB64(u8) { if (b64) return b64.fromByteArray(u8); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }

// Decrypt a sealed download into a playable file. Returns the plain file uri. ~10-30 ms native for a 3 MB clip
// plus the base64 hops through the file system.
export async function unseal(sealedUri, keyB64, ivB64, plainUri) {
  if (!QC) throw new Error('no native crypto');
  const t0 = Date.now();
  const enc = await FileSystem.readAsStringAsync(sealedUri, { encoding: 'base64' });
  const d = QC.createDecipheriv('aes-128-ctr', fromB64(keyB64), fromB64(ivB64));
  const a = d.update(fromB64(enc)); const b = d.final();
  const out = b && b.length ? concat(a, b) : a;
  await FileSystem.writeAsStringAsync(plainUri, toB64(out instanceof Uint8Array ? out : new Uint8Array(out)), { encoding: 'base64' });
  FileSystem.deleteAsync(sealedUri, { idempotent: true }).catch(() => {});
  return { uri: plainUri, ms: Date.now() - t0 };
}
function concat(a, b) { const u = new Uint8Array(a.length + b.length); u.set(a instanceof Uint8Array ? a : new Uint8Array(a), 0); u.set(b instanceof Uint8Array ? b : new Uint8Array(b), a.length); return u; }
