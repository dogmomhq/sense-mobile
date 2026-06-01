// supabaseClient.js — TEMPORARILY GATED OFF.
// supabase-js + react-native-url-polyfill don't resolve cleanly in Expo Go / Snack
// (bundle-time module-resolution failure -> white screen). Until I can verify the real fix on an
// Android emulator (so I'm not testing on CJ's phone), this exports a null stub: the app imports it
// safely, sign-in is hidden, and everything else works. The SERVER side of Supabase Auth is already
// live + verified (it accepts a supabaseToken when one is sent). Re-enable after emulator verification.
export const supabase = null;
