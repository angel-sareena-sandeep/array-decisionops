/**
 * decisionEngine.ts
 *
 * Deterministic MVP extraction and persistence for decisions and responsibilities.
 * English-only triggers. No NLP date parsing.
 *
 * Trigger patterns are defined in ./triggers and can be extended without
 * modifying this file.
 */

import {
  DecisionItem,
  DecisionStatus,
  ResponsibilityItem,
  ResponsibilityStatus,
} from "./contracts";
import { generateHash } from "./hash";
import {
  DECISION_FINAL_TRIGGERS,
  DECISION_TENTATIVE_TRIGGERS,
  OPTION_SELECT_RE,
  RESP_SELF_RE,
  RESP_OTHER_RE,
  RESP_PLEASE_ACTION_RE,
  RESP_GENERAL_TRIGGER_PHRASES,
  RESP_DEADLINE_RE,
  RESP_DEADLINE_ACTION_RE,
} from "./triggers";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MessageInput = {
  sender: string;
  message_text: string;
  message_hash: string;
  timestamp: string; // ISO
};

export type ExtractDecisionsResult = {
  items: DecisionItem[];
  evidenceByDecisionId: Record<string, string[]>;
};

export type ExtractResponsibilitiesResult = {
  items: ResponsibilityItem[];
  evidenceByResponsibilityId: Record<string, string[]>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Converts a title to a URL-safe slug: lowercase alphanumeric + underscores, max 64 chars.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/**
 * Truncates a string to maxLen, adding ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trimEnd() + "…";
}

// ─── Decision extraction ───────────────────────────────────────────────────────

function detectDecisionStatus(lower: string): DecisionStatus | null {
  for (const trigger of DECISION_FINAL_TRIGGERS) {
    if (lower.includes(trigger)) return "Final";
  }
  for (const trigger of DECISION_TENTATIVE_TRIGGERS) {
    if (lower.includes(trigger)) return "Tentative";
  }
  if (OPTION_SELECT_RE.test(lower)) return "Tentative";
  return null;
}

function buildDecisionTitle(msg: MessageInput): string {
  const line = msg.message_text.split("\n")[0].trim();
  return truncate(line, 80);
}

function buildDecisionExplanation(msg: MessageInput): string {
  const line = msg.message_text.split("\n")[0].trim();
  return truncate(`Decision based on: "${line}"`, 200);
}

export function extractDecisions(
  messages: MessageInput[],
): ExtractDecisionsResult {
  const items: DecisionItem[] = [];
  const evidenceByDecisionId: Record<string, string[]> = {};
  const seenIds = new Set<string>();

  for (const msg of messages) {
    const lower = msg.message_text.toLowerCase();
    const status = detectDecisionStatus(lower);
    if (!status) continue;

    const title = buildDecisionTitle(msg);
    const id = "dec_" + generateHash("decision|" + title).slice(0, 12);

    // Skip exact duplicate IDs within the same run
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const confidence = status === "Final" ? 80 : 60;

    const item: DecisionItem = {
      id,
      title,
      version: 1,
      status,
      confidence,
      explanation: buildDecisionExplanation(msg),
      timestamp: msg.timestamp,
      lastUpdated: msg.timestamp,
    };

    items.push(item);
    evidenceByDecisionId[id] = [msg.message_hash];
  }

  return { items, evidenceByDecisionId };
}

// ─── Responsibility extraction ─────────────────────────────────────────────────

function detectResponsibilityTrigger(lower: string, original: string): boolean {
  if (RESP_SELF_RE.test(original)) return true;
  if (RESP_OTHER_RE.test(lower)) return true;
  // "please" only fires when followed closely by a concrete action verb
  if (RESP_PLEASE_ACTION_RE.test(original)) return true;
  for (const phrase of RESP_GENERAL_TRIGGER_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  // "deadline" only when task-like (contains a task-action word)
  if (RESP_DEADLINE_RE.test(lower) && RESP_DEADLINE_ACTION_RE.test(lower)) {
    return true;
  }
  return false;
}

function buildResponsibilityOwner(msg: MessageInput): string {
  if (RESP_SELF_RE.test(msg.message_text)) return msg.sender;
  if (RESP_OTHER_RE.test(msg.message_text.toLowerCase())) return "unassigned";
  return "unassigned";
}

function buildResponsibilityTitle(msg: MessageInput): string {
  const line = msg.message_text.split("\n")[0].trim();
  return truncate(line, 80);
}

export function extractResponsibilities(
  messages: MessageInput[],
): ExtractResponsibilitiesResult {
  const items: ResponsibilityItem[] = [];
  const evidenceByResponsibilityId: Record<string, string[]> = {};
  const seenIds = new Set<string>();

  for (const msg of messages) {
    const lower = msg.message_text.toLowerCase();
    if (!detectResponsibilityTrigger(lower, msg.message_text)) continue;

    const title = buildResponsibilityTitle(msg);
    const id = "resp_" + generateHash("resp|" + title).slice(0, 12);

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const item: ResponsibilityItem = {
      id,
      title,
      description: "",
      owner: buildResponsibilityOwner(msg),
      due: "",
      status: "Open" as ResponsibilityStatus,
      timestamp: msg.timestamp,
      evidenceCount: 0,
    };

    items.push(item);
    evidenceByResponsibilityId[id] = [msg.message_hash];
  }

  return { items, evidenceByResponsibilityId };
}

// ─── Persist decisions ─────────────────────────────────────────────────────────

export async function persistDecisions(args: {
  supabase: unknown;
  chat_id: string;
  decisions: DecisionItem[];
  evidenceByDecisionId: Record<string, string[]>;
}): Promise<{
  threads_inserted: number;
  decisions_inserted: number;
  evidence_inserted: number;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = args.supabase as any;
  const { chat_id, decisions, evidenceByDecisionId } = args;

  if (decisions.length === 0) {
    return { threads_inserted: 0, decisions_inserted: 0, evidence_inserted: 0 };
  }

  let threads_inserted = 0;
  let decisions_inserted = 0;
  let evidence_inserted = 0;

  for (const dec of decisions) {
    const thread_key = slugify(dec.title);

    // Find or create thread
    let { data: threadRow } = await db
      .from("decision_threads")
      .select("id")
      .eq("chat_id", chat_id)
      .eq("thread_key", thread_key)
      .maybeSingle();

    if (!threadRow) {
      const { data: inserted } = await db
        .from("decision_threads")
        .insert({ chat_id, thread_key })
        .select("id")
        .single();
      threadRow = inserted;
      threads_inserted++;
    }

    if (!threadRow) continue;
    const thread_id: string = threadRow.id;

    // App-level idempotency: skip if this thread+version is already persisted
    const { data: existingDec } = await db
      .from("decisions")
      .select("id")
      .eq("thread_id", thread_id)
      .eq("version_no", dec.version)
      .maybeSingle();

    if (existingDec) continue;

    // Insert decision row
    const { data: decRow, error: decErr } = await db
      .from("decisions")
      .insert({
        thread_id,
        version_no: dec.version,
        status: dec.status,
        confidence: dec.confidence,
        decision_title: dec.title,
        final_outcome: dec.explanation,
        decided_at: dec.timestamp ?? null,
      })
      .select("id")
      .single();

    if (decErr || !decRow) {
      console.error("decisions insert error:", decErr?.message);
      continue;
    }
    decisions_inserted++;
    const decision_id: string = decRow.id;

    // Resolve message IDs for evidence hashes
    const hashes = evidenceByDecisionId[dec.id] ?? [];
    if (hashes.length === 0) continue;

    for (const chunk of chunkArray(hashes, CHUNK_SIZE)) {
      const { data: msgRows } = await db
        .from("messages")
        .select("id, msg_sha256")
        .eq("chat_id", chat_id)
        .in("msg_sha256", chunk);

      if (!msgRows || msgRows.length === 0) continue;

      const evidenceRows = (msgRows as { id: string }[]).map((m) => ({
        decision_id,
        message_id: m.id,
      }));

      await db.from("decision_evidence").insert(evidenceRows, {
        onConflict: "decision_id,message_id",
        ignoreDuplicates: true,
      });

      evidence_inserted += evidenceRows.length;
    }
  }

  return { threads_inserted, decisions_inserted, evidence_inserted };
}

// ─── Persist responsibilities ──────────────────────────────────────────────────

export async function persistResponsibilities(args: {
  supabase: unknown;
  chat_id: string;
  responsibilities: ResponsibilityItem[];
  evidenceByResponsibilityId: Record<string, string[]>;
}): Promise<{ inserted: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = args.supabase as any;
  const { chat_id, responsibilities, evidenceByResponsibilityId } = args;

  if (responsibilities.length === 0) return { inserted: 0 };

  let inserted = 0;

  for (const resp of responsibilities) {
    const hashes = evidenceByResponsibilityId[resp.id] ?? [];

    // Resolve first evidence hash to source_message_id if possible
    let source_message_id: string | null = null;
    if (hashes.length > 0) {
      const { data: msgRow } = await db
        .from("messages")
        .select("id")
        .eq("chat_id", chat_id)
        .eq("msg_sha256", hashes[0])
        .maybeSingle();
      if (msgRow) source_message_id = msgRow.id;
    }

    const task_text =
      resp.title + (resp.description ? " \u2014 " + resp.description : "");

    // App-level idempotency: skip if this (chat_id, owner, task_text) already exists
    const { data: existing } = await db
      .from("responsibilities")
      .select("id")
      .eq("chat_id", chat_id)
      .eq("owner", resp.owner)
      .eq("task_text", task_text)
      .maybeSingle();

    if (existing) continue;

    const { error } = await db.from("responsibilities").insert({
      chat_id,
      owner: resp.owner,
      task_text,
      status: resp.status,
      due_date: null,
      source_message_id,
    });

    if (!error) inserted++;
  }

  return { inserted };
}