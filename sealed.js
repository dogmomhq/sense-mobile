// sealed.js — B200 (SEALED-CLIP-SPEC-2026-09-13). The paid clip arrives during the countdown ENCRYPTED; the
// server sends the key at GO. Decrypt is native (react-native-quick-crypto, AES-128-CTR). On a build without
// the native module (Expo Go, an OTA onto an older native build) SEALED_OK is false, the app tells the server
// so in its queue message, and the server serves plain clips exactly as before. Nothing else changes.
import * as FileSystem from 'expo-file-system/legacy';
let QC = null, Buf = null;
try { QC = require('react-native-quick-crypto'); if (!QC || typeof QC.createDecipheriv !== 'function') QC = null; } catch (e) { QC = null; }
try { Buf = require('@craftzdog/react-native-buffer').Buffer; } catch (e) { Buf = null; } // native base64 <-> bytes (ships with quick-crypto 0.7)
export const SEALED_OK = !!(QC && Buf);

// Decrypt a sealed download into a playable file. Returns the plain file uri. Native AES-CTR (~10-30 ms for a
// 3 MB clip) plus two base64 hops through the file system.
export async function unseal(sealedUri, keyB64, ivB64, plainUri) {
  if (!QC || !Buf) throw new Error('no native crypto');
  const t0 = Date.now();
  const enc = await FileSystem.readAsStringAsync(sealedUri, { encoding: 'base64' });
  const d = QC.createDecipheriv('aes-128-ctr', Buf.from(keyB64, 'base64'), Buf.from(ivB64, 'base64'));
  const out = Buf.concat([d.update(Buf.from(enc, 'base64')), d.final()]);
  await FileSystem.writeAsStringAsync(plainUri, out.toString('base64'), { encoding: 'base64' });
  FileSystem.deleteAsync(sealedUri, { idempotent: true }).catch(() => {});
  return { uri: plainUri, ms: Date.now() - t0 };
}
