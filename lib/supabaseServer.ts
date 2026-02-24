/**
 * supabaseServer.ts
 *
 * SERVER-ONLY file. Do NOT import this from client components or browser code.
 * Provides an admin Supabase client using the service role key.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || url.trim().length === 0) {
    throw new Error(
      "Missing environment variable: SUPABASE_URL must be set before calling getSupabaseAdmin().",
    );
  }
  if (!key || key.trim().length === 0) {
    throw new Error(
      "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY must be set before calling getSupabaseAdmin().",
    );
  }

  _adminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _adminClient;
}