/**
 * Server-only Supabase admin client.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseAdmin(): SupabaseClient {
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

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}