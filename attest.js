// App Attest — OBSERVE MODE (P2, 2026-07-10). Registers this device's hardware-backed
// Secure Enclave key with the server once per install; the server verifies the Apple
// attestation and logs a verdict. NOTHING is enforced — every failure path here is
// silent by design so attestation can never break gameplay. Requires the B33+ native
// binary (react-native-ios-appattest); on older binaries the require() fails and we bail.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DONE_KEY = 'sense_attest_done';   // set once the server records a 'valid' verdict
const TRIES_KEY = 'sense_attest_tries'; // give up after 3 non-valid attempts (observe data collected, stop spamming)

// Pure-JS base64 <-> bytes (Hermes atob availability varies; don't gamble).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64ToBytes(s) {
  s = s.replace(/=+$/, ''); const out = [];
  let buf = 0, bits = 0;
  for (const ch of s) { const v = B64.indexOf(ch); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); } }
  return new Uint8Array(out);
}
function bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    out += b === undefined ? '==' : B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)] + (c === undefined ? '=' : B64[c & 63]);
  }
  return out;
}

export async function runAttestation(httpsBase, getAuthToken) {
  try {
    if (Platform.OS !== 'ios') return;
    if (await AsyncStorage.getItem(DONE_KEY)) return;
    const tries = parseInt(await AsyncStorage.getItem(TRIES_KEY)) || 0;
    if (tries >= 3) return;
    let AppAttest; try { AppAttest = require('react-native-ios-appattest'); } catch { return; }
    const supported = await AppAttest.attestationSupported().catch(() => false);
    if (!supported) return;

    const cr = await fetch(httpsBase + '/api/attest/challenge', { method: 'POST' });
    const { challenge } = await cr.json();
    if (!challenge) return;
    // Convention (must match server): device attests over SHA256(raw challenge bytes).
    // Server-side appattest-checker-node computes the same hash from the raw challenge.
    const Crypto = require('expo-crypto');
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, b64ToBytes(challenge));
    const hashB64 = bytesToB64(new Uint8Array(digest));

    const keyId = await AppAttest.generateKeys();
    const attestation = await AppAttest.attestKeys(keyId, hashB64);
    const tok = getAuthToken && getAuthToken();
    const rr = await fetch(httpsBase + '/api/attest/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ keyId, challenge, attestation }),
    });
    const j = await rr.json().catch(() => null);
    if (j && j.ok && j.verdict === 'valid') {
      await AsyncStorage.setItem(DONE_KEY, '1');
      await AsyncStorage.setItem('sense_attest_key', keyId);
    } else {
      await AsyncStorage.setItem(TRIES_KEY, String(tries + 1));
    }
  } catch {} // observe mode: never surface, never throw
}
