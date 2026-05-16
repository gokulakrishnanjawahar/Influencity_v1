// ─────────────────────────────────────────────
// Supabase Client — Frontend
// ─────────────────────────────────────────────
// Uses the anon key — respects Row Level Security.
// Never use the service role key on the frontend.
// ─────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default supabase;