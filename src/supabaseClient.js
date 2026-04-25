import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function createSupabaseClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

// Public client (no auth) for fetching agent list on login screen
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Edge Function base URL
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Export anon key for Edge Function calls
export const ANON_KEY = SUPABASE_ANON_KEY;
