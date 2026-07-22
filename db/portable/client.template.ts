// Drop-in replacement for src/integrations/supabase/client.ts on your OWN
// Supabase project (target ref: tebyyidgcsivzslaohxd).
//
// Copy this file to src/integrations/supabase/client.ts ONLY AFTER forking
// the repo away from Lovable Cloud — otherwise Lovable will regenerate it
// on the next sync and overwrite your changes.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copy db/portable/.env.example to .env and fill in your project values.",
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
