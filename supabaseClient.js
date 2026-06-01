// supabaseClient.js — Supabase Auth client for the mobile app (email one-time-code login).
// The anon/publishable key is safe to ship in the client (that's its purpose). Sessions persist
// in AsyncStorage and auto-refresh. This is the real, library-backed auth (replaces the hand-rolled token).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

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
