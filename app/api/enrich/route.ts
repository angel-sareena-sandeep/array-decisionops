/**
 * POST /api/enrich
 * Body JSON: { chat_id }
 *
 * On-demand LLM enrichment for a chat that has already been imported.
 * Runs Gemini 2.0 Flash (→ Groq fallback) on the full chat message history
 * and merges any new decisions / responsibilities into the database.
 *
 * Designed to be triggered manually from the UI to conserve free-tier quota.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { runEnrichment } from "@/lib/orchestrate";
import { isValidUUID, sanitizeErrorMessage } from "@/lib/security";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { chat_id } = (body as Record<string, unknown>) ?? {};

  if (typeof chat_id !== "string" || chat_id.trim().length === 0) {
    return NextResponse.json(
      { error: "Required field: chat_id." },
      { status: 400 },
    );
  }

  if (!isValidUUID(chat_id)) {
    return NextResponse.json(
      { error: "Invalid 'chat_id' format." },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Database configuration error." },
      { status: 500 },
    );
  }

  try {
    const result = await runEnrichment({ supabase, chat_id });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("runEnrichment error:", err);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Enrichment failed.") },
      { status: 500 },
    );
  }
}