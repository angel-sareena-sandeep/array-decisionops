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
  decisions_new: number;
  responsibilities_detected: number;
  responsibilities_new: number;
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
  // Primary: messages linked to this specific import via import_messages.
  // Fallback: all messages for the chat — guards against import_messages
  // not being fully populated (e.g. all-duplicate second import edge cases).
  let messages = await fetchImportMessages(supabase, import_id);

  if (messages.length === 0) {
    messages = await fetchChatMessages(supabase, chat_id);
  }

  if (messages.length === 0) {
    return {
      messages_analysed: 0,
      decisions_detected: 0,
      decisions_new: 0,
      responsibilities_detected: 0,
      responsibilities_new: 0,
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
  const decPersist = await persistDecisions({
    supabase: supabase as unknown,
    chat_id,
    decisions: decisionsResult.items,
    evidenceByDecisionId: decisionsResult.evidenceByDecisionId,
  });

  // ── Step 5: Persist responsibilities (idempotent via app-level dedupe) ───
  const respPersist = await persistResponsibilities({
    supabase: supabase as unknown,
    chat_id,
    responsibilities: responsibilitiesResult.items,
    evidenceByResponsibilityId:
      responsibilitiesResult.evidenceByResponsibilityId,
  });

  return {
    messages_analysed: messages.length,
    decisions_detected: decisionsResult.items.length,
    decisions_new: decPersist.decisions_inserted,
    responsibilities_detected: responsibilitiesResult.items.length,
    responsibilities_new: respPersist.inserted,
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
/**
 * Fetches ALL messages for a chat, sorted chronologically.
 * Used as a fallback when the import-scoped fetch returns nothing.
 */
async function fetchChatMessages(
  supabase: SupabaseClient,
  chat_id: string,
): Promise<MessageInput[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const results: MessageInput[] = [];

  let from = 0;
  // Paginate in large chunks to avoid response-size limits
  while (true) {
    const { data: rows, error } = await db
      .from("messages")
      .select("sender, text, msg_sha256, msg_ts")
      .eq("chat_id", chat_id)
      .order("msg_ts", { ascending: true })
      .range(from, from + CHUNK_SIZE - 1);

    if (error) {
      console.error(
        "orchestrate: fetchChatMessages query error:",
        error.message,
      );
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as {
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

    if (rows.length < CHUNK_SIZE) break;
    from += CHUNK_SIZE;
  }

  return results;
}

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
