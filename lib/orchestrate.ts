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
import { runLLMOnMessages, ExistingDecision } from "./llm";
import { DecisionItem, ResponsibilityItem } from "./contracts";
import { generateHash } from "./hash";

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchExistingDecisions(
  supabase: SupabaseClient,
  chat_id: string,
): Promise<ExistingDecision[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: threads } = await db
    .from("decision_threads")
    .select("id, thread_key")
    .eq("chat_id", chat_id);
  if (!threads || threads.length === 0) return [];
  const threadIds = threads.map((t: { id: string }) => t.id);
  const { data: decisions } = await db
    .from("decisions")
    .select("thread_id, version_no, decision_title")
    .in("thread_id", threadIds)
    .order("version_no", { ascending: false });
  if (!decisions) return [];
  const threadKeyById = Object.fromEntries(
    threads.map((t: { id: string; thread_key: string }) => [
      t.id,
      t.thread_key,
    ]),
  );
  const latestByThread: Record<string, ExistingDecision> = {};
  for (const d of decisions) {
    if (!latestByThread[d.thread_id]) {
      latestByThread[d.thread_id] = {
        thread_key: threadKeyById[d.thread_id],
        title: d.decision_title,
        version: d.version_no,
      };
    }
  }
  return Object.values(latestByThread);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .slice(0, 64);
}

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

  // ── Step 3: Persist decisions (idempotent via thread_key + version_no) ───
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

// ─── On-demand LLM enrichment ────────────────────────────────────────────────

export type EnrichResult = {
  messages_analysed: number;
  candidate_messages_sent: number;
  decisions_added: number;
  responsibilities_added: number;
  llm_used: "openrouter" | "groq" | "deterministic";
};

/**
 * Returns the subset of messages the deterministic engine flagged as evidence,
 * plus CONTEXT_WINDOW neighbours on each side, sorted chronologically.
 *
 * Sending only candidates to the LLM keeps the prompt well under free-tier
 * TPM limits (~3-4K tokens instead of ~19K for a 250-message chat).
 *
 * Falls back to ALL messages when fewer than MIN_CANDIDATES are found
 * (e.g. a chat with almost no decision language — LLM should see everything).
 */

/**
 * On-demand LLM enrichment for a chat that has already been imported.
 * Re-runs deterministic extraction as a merge baseline, runs the LLM
 * (Gemini → Groq → deterministic), and persists any net-new items.
 * Safe to call multiple times — persistence is idempotent.
 */
export async function runEnrichment(args: {
  supabase: SupabaseClient;
  chat_id: string;
}): Promise<EnrichResult> {
  const { supabase, chat_id } = args;

  const messages = await fetchChatMessages(supabase, chat_id);
  if (messages.length === 0) {
    return {
      messages_analysed: 0,
      candidate_messages_sent: 0,
      decisions_added: 0,
      responsibilities_added: 0,
      llm_used: "deterministic",
    };
  }

  // Deterministic baseline — the drafts that the LLM will improve
  const decisionsBase = extractDecisions(messages);
  const responsibilitiesBase = extractResponsibilities(messages);
  let llm_used: EnrichResult["llm_used"] = "deterministic";

  console.log(
    `enrich: ${messages.length} messages, ${decisionsBase.items.length} draft decisions, ${responsibilitiesBase.items.length} draft responsibilities`,
  );

  // Prepare draft decisions for the LLM (title + status + confidence + evidence)
  const draftDecisions = decisionsBase.items.map((d) => ({
    title: d.title,
    status: d.status,
    confidence: d.confidence,
    evidence_hashes: decisionsBase.evidenceByDecisionId[d.id] ?? [],
  }));

  // Prepare draft responsibilities for the LLM
  const draftResponsibilities = responsibilitiesBase.items.map((r) => ({
    title: r.title,
    owner: r.owner,
    description: r.description ?? "",
    evidence_hash:
      (responsibilitiesBase.evidenceByResponsibilityId[r.id] ?? [])[0] ?? "",
  }));

  // Fetch previously-tracked decisions so the LLM can reuse their thread_keys
  const existingDecisions = await fetchExistingDecisions(supabase, chat_id);
  console.log(
    `enrich: found ${existingDecisions.length} existing decisions for thread_key reuse`,
  );

  // LLM pass — send drafts + messages + existing decisions for context
  const llmOutput = await runLLMOnMessages(
    messages,
    draftDecisions,
    draftResponsibilities,
    existingDecisions,
  );
  console.log(
    `enrich: LLM returned ${llmOutput.decisions.length} decisions, ${llmOutput.responsibilities.length} responsibilities (provider: ${llmOutput.provider})`,
  );

  // Convert LLM output directly to the format persistDecisions expects.
  // The LLM output IS the final result — no merge needed.
  // Falls back to deterministic baseline if LLM returned nothing.
  let finalDecisions: DecisionItem[];
  let finalEvidenceByDecisionId: Record<string, string[]>;
  let finalResponsibilities: ResponsibilityItem[];
  let finalEvidenceByResponsibilityId: Record<string, string[]>;

  if (
    llmOutput.provider !== null &&
    (llmOutput.decisions.length > 0 || llmOutput.responsibilities.length > 0)
  ) {
    llm_used = llmOutput.provider;

    // Build decision items from LLM output
    finalDecisions = llmOutput.decisions.map((d) => {
      const id = "dec_" + generateHash("decision|" + d.thread_key).slice(0, 12);
      return {
        id,
        title: d.title,
        version: 1, // persistDecisions will auto-assign the real version
        status: d.status,
        confidence: d.confidence,
        explanation: d.explanation,
        timestamp: d.decided_at,
        lastUpdated: d.decided_at,
        thread_key: d.thread_key,
      } as DecisionItem & { thread_key: string };
    });
    finalEvidenceByDecisionId = {};
    for (const [i, d] of llmOutput.decisions.entries()) {
      finalEvidenceByDecisionId[finalDecisions[i].id] = d.evidence_hashes;
    }

    // Build responsibility items from LLM output
    finalResponsibilities = llmOutput.responsibilities.map((r) => {
      const id = "resp_" + generateHash("resp|" + r.evidence_hash).slice(0, 12);
      return {
        id,
        title: r.title,
        owner: r.owner,
        due: r.due,
        description: r.description,
        status: "Open" as const,
        timestamp: "",
        evidenceCount: 1,
      };
    });
    finalEvidenceByResponsibilityId = {};
    for (const [i, r] of llmOutput.responsibilities.entries()) {
      finalEvidenceByResponsibilityId[finalResponsibilities[i].id] = [
        r.evidence_hash,
      ];
    }
  } else {
    // LLM failed — fall back to deterministic baseline
    finalDecisions = decisionsBase.items;
    finalEvidenceByDecisionId = decisionsBase.evidenceByDecisionId;
    finalResponsibilities = responsibilitiesBase.items;
    finalEvidenceByResponsibilityId =
      responsibilitiesBase.evidenceByResponsibilityId;
  }

  // Compute which thread_keys the final result occupies
  const enrichedThreadKeys = new Set(
    finalDecisions.map(
      (d) =>
        (d as DecisionItem & { thread_key?: string }).thread_key ??
        slugify(d.title),
    ),
  );

  // Clear responsibilities before re-inserting (no versioning for them).
  await clearResponsibilitiesForChat(supabase, chat_id);

  // Persist decisions — enrichment mode updates in-place (no spurious v2).
  const decPersist = await persistDecisions({
    supabase: supabase as unknown,
    chat_id,
    decisions: finalDecisions,
    evidenceByDecisionId: finalEvidenceByDecisionId,
    enrichment: true,
  });
  const respPersist = await persistResponsibilities({
    supabase: supabase as unknown,
    chat_id,
    responsibilities: finalResponsibilities,
    evidenceByResponsibilityId: finalEvidenceByResponsibilityId,
  });

  console.log(
    `enrich: persisted ${decPersist.decisions_inserted} new decisions, ${respPersist.inserted} responsibilities`,
  );

  // Delete stale threads only when the LLM actually produced results
  if (llm_used !== "deterministic" && enrichedThreadKeys.size > 0) {
    if (decPersist.threads_inserted > 0 || decPersist.decisions_inserted > 0) {
      await deleteStaleThreads(supabase, chat_id, enrichedThreadKeys);
    } else {
      // LLM ran but nothing new written — verify all enriched threads exist
      // before deleting stale ones (content-same skip in persistDecisions).
      const existingEnrichedIds = await getThreadIdsForKeys(
        supabase,
        chat_id,
        enrichedThreadKeys,
      );
      if (existingEnrichedIds.size === enrichedThreadKeys.size) {
        await deleteStaleThreads(supabase, chat_id, enrichedThreadKeys);
      }
    }
  }

  return {
    messages_analysed: messages.length,
    candidate_messages_sent: messages.length,
    decisions_added: decPersist.decisions_inserted,
    responsibilities_added: respPersist.inserted,
    llm_used,
  };
}

/**
 * Returns the set of thread_keys from `keys` that actually exist in the DB.
 * Used to verify all enriched threads were persisted before deleting stale ones.
 */
async function getThreadIdsForKeys(
  supabase: SupabaseClient,
  chat_id: string,
  keys: Set<string>,
): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("decision_threads")
    .select("thread_key")
    .eq("chat_id", chat_id)
    .in("thread_key", Array.from(keys));
  if (!data) return new Set();
  return new Set((data as { thread_key: string }[]).map((r) => r.thread_key));
}

/**
 * Removes threads (+ their decisions + evidence) whose thread_key is NOT in
 * `keepKeys`. Used after enrichment to discard stale deterministic threads.
 */
async function deleteStaleThreads(
  supabase: SupabaseClient,
  chat_id: string,
  keepKeys: Set<string>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: allThreads } = await db
    .from("decision_threads")
    .select("id, thread_key")
    .eq("chat_id", chat_id);

  if (!allThreads || allThreads.length === 0) return;

  const staleIds = (allThreads as { id: string; thread_key: string }[])
    .filter((t) => !keepKeys.has(t.thread_key))
    .map((t) => t.id);

  if (staleIds.length === 0) return;

  const { data: staleDecisions } = await db
    .from("decisions")
    .select("id")
    .in("thread_id", staleIds);

  if (staleDecisions && staleDecisions.length > 0) {
    const decIds = (staleDecisions as { id: string }[]).map((d) => d.id);
    await db.from("decision_evidence").delete().in("decision_id", decIds);
    await db.from("decisions").delete().in("thread_id", staleIds);
  }

  await db.from("decision_threads").delete().in("id", staleIds);
  console.log(
    `enrich: deleted ${staleIds.length} stale threads for chat ${chat_id}`,
  );
}

/**
 * Deletes all responsibilities for the given chat.
 * Used by runEnrichment to replace rather than stack.
 */
async function clearResponsibilitiesForChat(
  supabase: SupabaseClient,
  chat_id: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error, count } = await db
    .from("responsibilities")
    .delete()
    .eq("chat_id", chat_id);
  if (error) {
    console.error("enrich: failed to clear responsibilities:", error.message);
  } else {
    console.log(
      `enrich: cleared ${count ?? "?"} existing responsibilities for chat ${chat_id}`,
    );
  }
}

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

  // Single join query instead of two-stage (links → messages)
  const { data: rows, error } = await db
    .from("import_messages")
    .select("messages(sender, text, msg_sha256, msg_ts)")
    .eq("import_id", import_id);

  if (error) {
    console.error("orchestrate: import_messages join error:", error.message);
    return [];
  }

  if (!rows || rows.length === 0) {
    return [];
  }

  const results: MessageInput[] = (
    rows as {
      messages: {
        sender: string;
        text: string;
        msg_sha256: string;
        msg_ts: string;
      } | null;
    }[]
  )
    .filter((r) => r.messages !== null)
    .map((r) => ({
      sender: r.messages!.sender,
      message_text: r.messages!.text,
      message_hash: r.messages!.msg_sha256,
      timestamp: r.messages!.msg_ts,
    }));

  // Sort chronologically so trigger scanning respects message order
  results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return results;
}