/**
 * orchestrate.ts
 *
 * Post-sync analysis pipeline for a completed WhatsApp import.
 *
 * After sync.ts persists chats → chat_imports → messages → import_messages,
 * this module:
 *   1. Fetches the message set for this import via import_messages → messages
 *      (so pre-existing deduped messages that were re-linked are included).
 *   2. Runs deterministic extraction (decisions + responsibilities).
 *   3. [Future slot] Optional LLM enrichment pass (not implemented yet).
 *   4. Persists results via decisionEngine (both persist functions are idempotent).
 *
 * Design constraints:
 * - No LLM calls. The slot comment below marks where they should be inserted.
 * - Persistence functions are not modified here; they remain reusable.
 * - Re-running against the same import_id is fully safe (idempotent).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  MessageInput,
  extractDecisions,
  extractResponsibilities,
  persistDecisions,
  persistResponsibilities,
} from "./decisionEngine";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AnalysisResult = {
  messages_analysed: number;
  decisions_detected: number;
  responsibilities_detected: number;
};

// ─── Chunking helper ──────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Main orchestration entry point ──────────────────────────────────────────

/**
 * Runs the full analysis pipeline for a completed import.
 *
 * Call this immediately after syncWhatsAppImport returns, passing the
 * chat_id and import_id from the sync result.
 *
 * Step 3 (LLM enrichment) is intentionally a no-op placeholder.
 * When LLM extraction is added, insert it between steps 2 and 4
 * without changing the persistence calls.
 */
export async function runAnalysisPipeline(args: {
  supabase: SupabaseClient;
  chat_id: string;
  import_id: string;
}): Promise<AnalysisResult> {
  const { supabase, chat_id, import_id } = args;

  // ── Step 1: Fetch messages for this import from the DB ───────────────────
  const messages = await fetchImportMessages(supabase, import_id);

  if (messages.length === 0) {
    return {
      messages_analysed: 0,
      decisions_detected: 0,
      responsibilities_detected: 0,
    };
  }

  // ── Step 2: Deterministic extraction ─────────────────────────────────────
  const decisionsResult = extractDecisions(messages);
  const responsibilitiesResult = extractResponsibilities(messages);

  // ── Step 3: Future LLM enrichment slot ───────────────────────────────────
  // Insert an optional LLM candidate extraction pass here when ready.
  // The LLM pass should produce additional DecisionItem[] / ResponsibilityItem[]
  // arrays that can be merged with decisionsResult.items / responsibilitiesResult.items
  // before the persistence calls below.  The persistence functions are
  // deterministic and idempotent regardless of input source.
  //
  // Example (do NOT uncomment — not implemented):
  //   const llmDecisions = await llmExtractDecisions(messages);
  //   const mergedDecisions = mergeByTitle(decisionsResult.items, llmDecisions);
  //
  // For now: pass extraction results directly to persistence.

  // ── Step 4: Persist decisions (idempotent via thread_key + version_no) ───
  await persistDecisions({
    supabase: supabase as unknown,
    chat_id,
    decisions: decisionsResult.items,
    evidenceByDecisionId: decisionsResult.evidenceByDecisionId,
  });

  // ── Step 5: Persist responsibilities (idempotent via app-level dedupe) ───
  await persistResponsibilities({
    supabase: supabase as unknown,
    chat_id,
    responsibilities: responsibilitiesResult.items,
    evidenceByResponsibilityId:
      responsibilitiesResult.evidenceByResponsibilityId,
  });

  return {
    messages_analysed: messages.length,
    decisions_detected: decisionsResult.items.length,
    responsibilities_detected: responsibilitiesResult.items.length,
  };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Fetches all messages linked to the given import_id via import_messages,
 * returning them as MessageInput objects sorted chronologically by msg_ts.
 *
 * Uses chunked IN queries to avoid URL/query length limits on large imports.
 * Only selects the columns required by the extraction engine.
 */
async function fetchImportMessages(
  supabase: SupabaseClient,
  import_id: string,
): Promise<MessageInput[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Fetch all message_ids linked to this import
  const { data: linkRows, error: linkErr } = await db
    .from("import_messages")
    .select("message_id")
    .eq("import_id", import_id);

  if (linkErr) {
    console.error("orchestrate: import_messages query error:", linkErr.message);
    return [];
  }

  if (!linkRows || linkRows.length === 0) {
    return [];
  }

  const messageIds: string[] = (linkRows as { message_id: string }[]).map(
    (r) => r.message_id,
  );

  const results: MessageInput[] = [];

  // Fetch message rows in chunks to avoid query-length limits
  for (const chunk of chunkArray(messageIds, CHUNK_SIZE)) {
    const { data: msgRows, error: msgErr } = await db
      .from("messages")
      .select("sender, text, msg_sha256, msg_ts")
      .in("id", chunk);

    if (msgErr) {
      console.error("orchestrate: messages query error:", msgErr.message);
      continue;
    }

    if (!msgRows) continue;

    for (const row of msgRows as {
      sender: string;
      text: string;
      msg_sha256: string;
      msg_ts: string;
    }[]) {
      results.push({
        sender: row.sender,
        message_text: row.text,
        message_hash: row.msg_sha256,
        timestamp: row.msg_ts,
      });
    }
  }

  // Sort chronologically so trigger scanning respects message order
  results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return results;
}