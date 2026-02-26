/**
 * POST /api/import/whatsapp
 * Body JSON: { chat_name, file_name, file_sha256, content }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { syncWhatsAppImport } from "@/lib/sync";
import { runAnalysisPipeline } from "@/lib/orchestrate";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { chat_name, file_name, file_sha256, content } =
    (body as Record<string, unknown>) ?? {};

  if (
    typeof chat_name !== "string" ||
    chat_name.trim().length === 0 ||
    typeof file_name !== "string" ||
    file_name.trim().length === 0 ||
    typeof file_sha256 !== "string" ||
    file_sha256.trim().length === 0 ||
    typeof content !== "string" ||
    content.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Required fields: chat_name, file_name, file_sha256, content." },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase config error." },
      { status: 500 },
    );
  }

  // ── Sync messages ───────────────────────────────────────────────────────────
  let syncResult: Awaited<ReturnType<typeof syncWhatsAppImport>>;
  try {
    syncResult = await syncWhatsAppImport({
      supabase,
      chat_name,
      file_name,
      file_sha256,
      content,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 },
    );
  }

  const { chat_id, import_id, total_parsed, inserted_messages } = syncResult;
  const duplicates_skipped = total_parsed - inserted_messages;

  // ── Analysis pipeline ───────────────────────────────────────────────────────
  // Fetch messages via import_messages → messages (DB-linked set, not re-parsed),
  // then extract and persist decisions + responsibilities (both idempotent).
  let analysisResult: Awaited<ReturnType<typeof runAnalysisPipeline>>;
  try {
    analysisResult = await runAnalysisPipeline({
      supabase,
      chat_id,
      import_id,
    });
  } catch (err: unknown) {
    console.error("runAnalysisPipeline error:", err);
    // Analysis failure is non-fatal: sync already succeeded.
    analysisResult = {
      messages_analysed: 0,
      decisions_detected: 0,
      responsibilities_detected: 0,
    };
  }

  return NextResponse.json({
    chat_id,
    import_id,
    messages_parsed: total_parsed,
    new_messages: inserted_messages,
    duplicates_skipped,
    decisions_detected: analysisResult.decisions_detected,
    responsibilities_detected: analysisResult.responsibilities_detected,
  });
}