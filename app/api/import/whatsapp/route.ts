/**
 * POST /api/import/whatsapp
 * Body JSON: { chat_name, file_name, file_sha256, content }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { syncWhatsAppImport } from "@/lib/sync";
import { parseChat } from "@/lib/parser";
import {
  extractDecisions,
  extractResponsibilities,
  persistDecisions,
  persistResponsibilities,
  MessageInput,
} from "@/lib/decisionEngine";

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

  // ── Extract & persist decisions + responsibilities ─────────────────────────
  const parsed = parseChat(content);
  const messageInputs: MessageInput[] = parsed.map((m) => ({
    sender: m.sender,
    message_text: m.message_text,
    message_hash: m.message_hash,
    timestamp: m.timestamp,
  }));

  const decisions = extractDecisions(messageInputs);
  const responsibilities = extractResponsibilities(messageInputs);

  try {
    await persistDecisions({
      supabase,
      chat_id,
      decisions: decisions.items,
      evidenceByDecisionId: decisions.evidenceByDecisionId,
    });
  } catch (err: unknown) {
    console.error("persistDecisions error:", err);
  }

  try {
    await persistResponsibilities({
      supabase,
      chat_id,
      responsibilities: responsibilities.items,
      evidenceByResponsibilityId: responsibilities.evidenceByResponsibilityId,
    });
  } catch (err: unknown) {
    console.error("persistResponsibilities error:", err);
  }

  return NextResponse.json({
    chat_id,
    import_id,
    messages_parsed: total_parsed,
    new_messages: inserted_messages,
    duplicates_skipped,
    decisions_detected: decisions.items.length,
    responsibilities_detected: responsibilities.items.length,
  });
}