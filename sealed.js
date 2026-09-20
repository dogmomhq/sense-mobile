// sealed.js — B200 (SEALED-CLIP-SPEC-2026-09-13). The paid clip arrives during the countdown ENCRYPTED; the
// server sends the key at GO. Decrypt is native (react-native-quick-crypto, AES-128-CTR). On a build without
// the native module (Expo Go, an OTA onto an older native build) SEALED_OK is false, the app tells the server
// so in its queue message, and the server serves plain clips exactly as before. Nothing else changes.
import * as FileSystem from 'expo-file-system/legacy';
let QC = null, Buf = null;
// B214 (2026-09-20): every phone since build 26 has reported SEALED_OK=false and the reason was swallowed here.
// Keep it (SEALED_WHY) so the launch beacon can say exactly what failed on the device.
export let SEALED_WHY = null;
try { QC = require('react-native-quick-crypto'); if (QC && typeof QC.createDecipheriv !== 'function' && QC.default) QC = QC.default; if (!QC || typeof QC.createDecipheriv !== 'function') { SEALED_WHY = 'quick-crypto loaded but no createDecipheriv (keys: ' + Object.keys(QC || {}).slice(0, 8).join(',') + ')'; QC = null; } } catch (e) { SEALED_WHY = 'quick-crypto: ' + String(e && e.message).slice(0, 200); QC = null; }
try { Buf = require('@craftzdog/react-native-buffer').Buffer; if (typeof Buf !== 'function') { SEALED_WHY = (SEALED_WHY ? SEALED_WHY + ' | ' : '') + 'rn-buffer: no Buffer export'; Buf = null; } } catch (e) { SEALED_WHY = (SEALED_WHY ? SEALED_WHY + ' | ' : '') + 'rn-buffer: ' + String(e && e.message).slice(0, 120); Buf = null; } // native base64 <-> bytes (ships with quick-crypto 0.7)
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
