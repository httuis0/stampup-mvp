// ============================================================
// Supabase Client Initialization
// - Uses public anon key ONLY (never service_role).
// - Uses AsyncStorage to persist owner session across app restarts.
// ============================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Default credentials (fallback for standalone builds if .env not bundled)
const FALLBACK_SUPABASE_URL = 'https://leoleteiwpirmdtfoufa.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlb2xldGVpd3Bpcm1kdGZvdWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MzE0MjQsImV4cCI6MjEwNjUwNzQyNH0.ijyVogbCxLllDgf_4EgoYyMFZ9QqCayiUi3OxuEWrhk';

// Read API keys from environment variables (.env) or use fallback
let rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL).trim();
// Automatically sanitize URL if user copied the REST API endpoint (e.g. /rest/v1/)
const supabaseUrl = (rawUrl || FALLBACK_SUPABASE_URL).replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
