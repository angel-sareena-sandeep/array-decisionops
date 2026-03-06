/**
 * Analysis and enrichment orchestration.
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

// Helpers

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

// Types

export type AnalysisResult = {
  messages_analysed: number;
  decisions_detected: number;
  decisions_new: number;
  responsibilities_detected: number;
  responsibilities_new: number;
};

// Chunk helper

const CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Main pipeline

/**
 * Run analysis pipeline for one import.
 */
export async function runAnalysisPipeline(args: {
  supabase: SupabaseClient;
  chat_id: string;
  import_id: string;
}): Promise<AnalysisResult> {
  const { supabase, chat_id, import_id } = args;

  // Step 1: fetch messages
  // Use chat fallback when import links are empty
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

  // Step 2: deterministic extraction
  const decisionsResult = extractDecisions(messages);
  const responsibilitiesResult = extractResponsibilities(messages);

  // Step 3: persist decisions
  const decPersist = await persistDecisions({
    supabase: supabase as unknown,
    chat_id,
    decisions: decisionsResult.items,
    evidenceByDecisionId: decisionsResult.evidenceByDecisionId,
  });

  // Step 4: persist responsibilities
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

// On-demand LLM enrichment

export type EnrichResult = {
  messages_analysed: number;
  candidate_messages_sent: number;
  decisions_added: number;
  responsibilities_added: number;
  llm_used: "openrouter" | "groq" | "deterministic";
};

/**
 * Runs enrichment using full chat context.
 */

/**
 * Enrich extracted decisions and responsibilities.
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

  // Deterministic baseline
  const decisionsBase = extractDecisions(messages);
  const responsibilitiesBase = extractResponsibilities(messages);
  let llm_used: EnrichResult["llm_used"] = "deterministic";

  console.log(
    `enrich: ${messages.length} messages, ${decisionsBase.items.length} draft decisions, ${responsibilitiesBase.items.length} draft responsibilities`,
  );

  // Build draft decisions
  const draftDecisions = decisionsBase.items.map((d) => ({
    title: d.title,
    status: d.status,
    confidence: d.confidence,
    evidence_hashes: decisionsBase.evidenceByDecisionId[d.id] ?? [],
  }));

  // Build draft responsibilities
  const draftResponsibilities = responsibilitiesBase.items.map((r) => ({
    title: r.title,
    owner: r.owner,
    description: r.description ?? "",
    evidence_hash:
      (responsibilitiesBase.evidenceByResponsibilityId[r.id] ?? [])[0] ?? "",
  }));

  // Load existing decisions for thread_key reuse
  const existingDecisions = await fetchExistingDecisions(supabase, chat_id);
  console.log(
    `enrich: found ${existingDecisions.length} existing decisions for thread_key reuse`,
  );

  // Run LLM pass
  const llmOutput = await runLLMOnMessages(
    messages,
    draftDecisions,
    draftResponsibilities,
    existingDecisions,
  );
  console.log(
    `enrich: LLM returned ${llmOutput.decisions.length} decisions, ${llmOutput.responsibilities.length} responsibilities (provider: ${llmOutput.provider})`,
  );

  // Convert LLM output to persistence format
  // Fallback to deterministic results when needed
  let finalDecisions: DecisionItem[];
  let finalEvidenceByDecisionId: Record<string, string[]>;
  let finalResponsibilities: ResponsibilityItem[];
  let finalEvidenceByResponsibilityId: Record<string, string[]>;

  if (
    llmOutput.provider !== null &&
    (llmOutput.decisions.length > 0 || llmOutput.responsibilities.length > 0)
  ) {
    llm_used = llmOutput.provider;

    // Build decision items
    finalDecisions = llmOutput.decisions.map((d) => {
      const id = "dec_" + generateHash("decision|" + d.thread_key).slice(0, 12);
      return {
        id,
        title: d.title,
        version: 1, // final version set by persistDecisions
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

    // Build responsibility items
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
    // Fallback to deterministic baseline
    finalDecisions = decisionsBase.items;
    finalEvidenceByDecisionId = decisionsBase.evidenceByDecisionId;
    finalResponsibilities = responsibilitiesBase.items;
    finalEvidenceByResponsibilityId =
      responsibilitiesBase.evidenceByResponsibilityId;
  }

  // Collect thread keys in final results
  const enrichedThreadKeys = new Set(
    finalDecisions.map(
      (d) =>
        (d as DecisionItem & { thread_key?: string }).thread_key ??
        slugify(d.title),
    ),
  );

  // Replace responsibilities
  await clearResponsibilitiesForChat(supabase, chat_id);

  // Persist decisions in enrichment mode
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

  // Delete stale threads only after LLM output
  if (llm_used !== "deterministic" && enrichedThreadKeys.size > 0) {
    if (decPersist.threads_inserted > 0 || decPersist.decisions_inserted > 0) {
      await deleteStaleThreads(supabase, chat_id, enrichedThreadKeys);
    } else {
      // Verify enriched threads before stale-thread cleanup
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
 * Return existing thread keys from a set.
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
 * Remove threads not in keep list.
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
 * Delete all responsibilities for a chat.
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
 * Fetch all chat messages in time order.
 */
async function fetchChatMessages(
  supabase: SupabaseClient,
  chat_id: string,
): Promise<MessageInput[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const results: MessageInput[] = [];

  let from = 0;
  // Paginate by chunks
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

  // Single join query
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

  // Sort chronologically
  results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return results;
}