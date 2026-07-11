// Push registration (P2, 2026-07-10). Two modes:
//   askIfNeeded:false — app start: if permission already granted, silently refresh the
//                       Expo token with the server (only POSTs when token/account changed).
//   askIfNeeded:true  — right after submitting an async answer: the ONE moment we ask
//                       for permission (user just created a reason to want the result).
//                       We only ever ASK once per install; declining is respected forever
//                       (they can still enable in iOS Settings, and the silent path picks it up).
// All failures silent — push can never break gameplay. Requires B33+ native binary.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ASKED_KEY = 'sense_push_asked';
const SENT_KEY = 'sense_push_sent'; // "<authTokenPrefix>:<expoToken>" last successfully registered
const PROJECT_ID = 'ee740f0c-1158-49cb-86a6-b5ed2d72f8b6'; // EAS project (owner commonsense94)

export async function ensurePushRegistration(httpsBase, getAuthToken, { askIfNeeded = false } = {}) {
  try {
    if (Platform.OS !== 'ios') return;
    let Notifications; try { Notifications = require('expo-notifications'); } catch { return; }
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      if (!askIfNeeded) return;
      if (await AsyncStorage.getItem(ASKED_KEY)) return; // never nag twice
      await AsyncStorage.setItem(ASKED_KEY, '1');
      perm = await Notifications.requestPermissionsAsync();
      if (perm.status !== 'granted') return;
    }
    const tok = getAuthToken && getAuthToken();
    if (!tok) return; // server keys tokens by account — nothing to register against yet
    const t = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const expoToken = t && t.data;
    if (!expoToken) return;
    const stamp = tok.slice(0, 16) + ':' + expoToken; // account changes AND token rotations both re-register
    if ((await AsyncStorage.getItem(SENT_KEY)) === stamp) return;
    const r = await fetch(httpsBase + '/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ expoToken, platform: Platform.OS }),
    });
    const j = await r.json().catch(() => null);
    if (j && j.ok) await AsyncStorage.setItem(SENT_KEY, stamp);
  } catch {}
}

// B35 (CJ 2026-07-11): waiting-screen "TURN ON NOTIFICATIONS" support.
// getPushStatus -> 'granted' | 'undetermined' (can show system prompt) |
// 'denied' (iOS won't re-prompt; only Settings can flip it) | 'unsupported'.
export async function getPushStatus() {
  try {
    if (Platform.OS !== 'ios') return 'unsupported';
    let Notifications; try { Notifications = require('expo-notifications'); } catch { return 'unsupported'; }
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === 'granted') return 'granted';
    return perm.canAskAgain === false ? 'denied' : 'undetermined';
  } catch { return 'unsupported'; }
}

// Explicit button tap = fresh consent, so this bypasses the asked-once gate that
// ensurePushRegistration respects. undetermined -> system prompt in place;
// denied -> deep-link to the app's iOS Settings page (the system will never
// re-prompt) and the caller's foreground re-check picks up the flip on return.
// Returns true only when permission is granted AND registration was kicked off.
export async function requestPushPermission(httpsBase, getAuthToken) {
  try {
    if (Platform.OS !== 'ios') return false;
    let Notifications; try { Notifications = require('expo-notifications'); } catch { return false; }
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      if (perm.canAskAgain === false) {
        const { Linking } = require('react-native');
        Linking.openSettings().catch(() => {});
        return false;
      }
      await AsyncStorage.setItem(ASKED_KEY, '1'); // this WAS the one ask
      perm = await Notifications.requestPermissionsAsync();
      if (perm.status !== 'granted') return false;
    }
    await ensurePushRegistration(httpsBase, getAuthToken, { askIfNeeded: false });
    return true;
  } catch { return false; }
}
