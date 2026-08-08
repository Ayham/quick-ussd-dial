import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

let supabaseClient: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseClient) {
    if (!isSupabaseConfigured()) {
      console.warn(
        "[cloud] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — running in offline-only mode.",
      );
      throw new Error(
        "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
          "Copy db/portable/.env.example to .env and fill in your project values.",
      );
    }
    supabaseClient = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return supabaseClient;
}

// Lazy proxy: importing this module never throws and never creates a Supabase
// client. The real client is created on first property access (the first cloud
// call actually made). This keeps the offline core fully free of cloud I/O.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabase();
      const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
) as SupabaseClient<Database>;
