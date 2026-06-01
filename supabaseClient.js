// supabaseClient.js — Supabase Auth client for the mobile app (email one-time-code login).
// The anon/publishable key is safe to ship in the client (that's its purpose). Sessions persist
// in AsyncStorage and auto-refresh. This is the real, library-backed auth (replaces the hand-rolled token).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// RN's built-in URL is incomplete; Supabase needs the polyfill on NATIVE only (web has a real URL).
// Use the package MAIN entry (setupURLPolyfill) instead of the '/auto' subpath — Expo Snack's bundler
// can't resolve 'react-native-url-polyfill/auto', but resolves the main export fine. Real EAS builds
// resolve either; this just keeps the Snack preview working too.
if (Platform.OS !== 'web') {
  try {
    const { setupURLPolyfill } = require('react-native-url-polyfill');
    setupURLPolyfill();
  } catch (e) {
    try { require('react-native-url-polyfill/auto'); } catch (e2) {}
  }
}

const SUPABASE_URL = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
const SUPABASE_ANON = 'sb_publishable_9zFwYO_7mtG9wt9pgsWi-A_hnsIQYvv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
