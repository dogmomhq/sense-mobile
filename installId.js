// ── INSTALL ID (B151) ─────────────────────────────────────────────────────────────────────────
// One stable id per app install, minted on first use and kept in AsyncStorage. It rides on every
// register / queue / deposit so the server can enforce ONE account per phone (a second account on
// the same install is refused on the money paths) and never match two accounts on one device.
// Not a hardware id: a reinstall mints a new one. App Attest keys are the stronger, hardware-bound
// signal and are linked server-side when present. Shared by App.js and DepositCoinflow.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
let _installId = null;
export async function installId() {
  if (_installId) return _installId;
  try {
    const v = await AsyncStorage.getItem('sense_install_id');
    if (v) { _installId = v; return v; }
    const n = 'inst_' + Crypto.randomUUID();
    await AsyncStorage.setItem('sense_install_id', n); _installId = n; return n;
  } catch { return null; } // null = omitted from messages; never send a fake id every install would share
}
export function installIdSync() { return _installId; } // whatever has been minted so far (null before first await)
