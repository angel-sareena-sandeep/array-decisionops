/**
 * POST /api/import/whatsapp
 * Body JSON: { chat_name, file_name, file_sha256, content }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { syncWhatsAppImport } from "@/lib/sync";
import { runAnalysisPipeline } from "@/lib/orchestrate";
import {
  validateStringField,
  isValidSHA256,
  MAX_LENGTHS,
  sanitizeErrorMessage,
} from "@/lib/security";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    chat_name: _cn,
    file_name: _fn,
    file_sha256: _fs,
    content: _ct,
  } = (body as Record<string, unknown>) ?? {};

  // ── Input validation ────────────────────────────────────────────────────────
  for (const [name, value, max] of [
    ["chat_name", _cn, MAX_LENGTHS.chat_name],
    ["file_name", _fn, MAX_LENGTHS.file_name],
    ["file_sha256", _fs, MAX_LENGTHS.file_sha256],
    ["content", _ct, MAX_LENGTHS.content],
  ] as [string, unknown, number][]) {
    const err = validateStringField(name, value, max);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  if (!isValidSHA256(_fs as string)) {
    return NextResponse.json(
      {
        error:
          "'file_sha256' must be a valid SHA-256 hex string (64 hex chars).",
      },
      { status: 400 },
    );
  }

  // After validation, these are guaranteed to be non-empty strings
  const chat_name = _cn as string;
  const file_name = _fn as string;
  const file_sha256 = _fs as string;
  const content = _ct as string;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Database configuration error." },
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
    console.error("syncWhatsAppImport error:", err);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Import sync failed.") },
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
      decisions_new: 0,
      responsibilities_detected: 0,
      responsibilities_new: 0,
    };
  }

  return NextResponse.json({
    chat_id,
    import_id,
    messages_parsed: total_parsed,
    new_messages: inserted_messages,
    duplicates_skipped,
    decisions_detected: analysisResult.decisions_detected,
    decisions_new: analysisResult.decisions_new,
    responsibilities_detected: analysisResult.responsibilities_detected,
    responsibilities_new: analysisResult.responsibilities_new,
  });
}