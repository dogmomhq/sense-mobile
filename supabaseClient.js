// supabaseClient.js — Supabase Auth client (email one-time-code login).
// Real EAS/TestFlight builds: full login. Expo Go / Snack previews: the runtime is missing native
// polyfills Supabase needs (URL/crypto), so we GUARD init — if anything fails, export null and the app
// loads with sign-in hidden instead of crashing. Login is verified working on real native builds.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
const SUPABASE_ANON = 'sb_publishable_9zFwYO_7mtG9wt9pgsWi-A_hnsIQYvv';

let _supabase = null;
try {
  if (Platform.OS !== 'web') {
    try { const { setupURLPolyfill } = require('react-native-url-polyfill'); setupURLPolyfill(); }
    catch (e) { try { require('react-native-url-polyfill/auto'); } catch (e2) {} }
  }
  // require (not static import) so a load-time failure is caught and nulled rather than crashing the app
  const { createClient } = require('@supabase/supabase-js');
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
} catch (e) {
  _supabase = null; // unsupported runtime (Expo Go / Snack) — login hidden, everything else works
}

export const supabase = _supabase;
