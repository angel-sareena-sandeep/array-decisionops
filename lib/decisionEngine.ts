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
  DECISION_SUMMARY_RE,
  DECISION_EMOJI_RE,
  DECISION_DATE_RE,
  DECISION_ACTION_RE,
  AGREEMENT_SHORT_RE,
  AGREEMENT_EMOJI_RE,
  RESP_SELF_RE,
  RESP_OTHER_RE,
  RESP_PLEASE_ACTION_RE,
  RESP_GENERAL_TRIGGER_PHRASES,
  RESP_DEADLINE_RE,
  RESP_DEADLINE_ACTION_RE,
  RESP_DATE_RE,
  RESP_DATE_ACTION_RE,
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

/**
 * Messages that should NEVER be treated as decisions even if they contain
 * trigger phrases.  Checked before trigger matching.
 */
const QUESTION_RE = /\?\s*[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}]*\s*$/u;
const STATUS_UPDATE_RE =
  /^(blocker|checkin|check-in|update|status|progress)[:\s]/i;
const PERSONAL_ACTION_RE =
  /^(ok\s+)?(i'm muting|i have class|im going|i'm going|brb|gtg|gotta go|muting|afk)/i;
const BULLET_RE = /^[-\u2022*]\s/;

/**
 * Detects \"meta-language\" \u2014 messages that TALK ABOUT keywords/phrases
 * rather than using them as actual decisions or commitments.
 * e.g. 'decision detection keywords: final, decided, we will, deadline, submit by'
 *      'sometimes \"i can do it\"'
 */
const META_LIST_RE =
  /\b(keywords?|triggers?|phrases?|examples?|patterns?)[:\s].*,.*,/i;
const META_QUOTE_RE =
  /[\u201C\u201D\u2018\u2019"'](?:i[' ]?(?:ll|will|can)|we will|final|decided|submit|deadline|handle|assigned)[\u201C\u201D\u2018\u2019"']/i;

function isExcluded(text: string): boolean {
  if (QUESTION_RE.test(text)) return true;
  if (STATUS_UPDATE_RE.test(text)) return true;
  if (PERSONAL_ACTION_RE.test(text)) return true;
  if (BULLET_RE.test(text)) return true;
  if (META_LIST_RE.test(text)) return true;
  if (META_QUOTE_RE.test(text)) return true;
  return false;
}

function detectDecisionStatus(
  lower: string,
  original: string,
): DecisionStatus | null {
  for (const trigger of DECISION_FINAL_TRIGGERS) {
    if (lower.includes(trigger)) return "Final";
  }
  for (const trigger of DECISION_TENTATIVE_TRIGGERS) {
    if (lower.includes(trigger)) return "Tentative";
  }
  if (OPTION_SELECT_RE.test(lower)) return "Tentative";
  // "ok so ..." summary pattern → speaker is confirming a decision
  if (DECISION_SUMMARY_RE.test(original)) return "Tentative";
  // Confirmation emoji (✅, ✓, etc.) at end of message
  if (DECISION_EMOJI_RE.test(original)) return "Tentative";
  // Date reference + delivery/submission action word → schedule decision
  if (DECISION_DATE_RE.test(lower) && DECISION_ACTION_RE.test(lower))
    return "Tentative";
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

// ─── Context-window helpers ───────────────────────────────────────────────────────────

const GREETING_RE =
  /^(gm|morning|hi|hello|hey|bye|lol|haha|hahaha|same|ok|yes|no|yep|nah|stop|brb|back|end)[!.\s😭😂🤣]*$/i;
const MEDIA_RE = /<[Mm]edia omitted>/;

/**
 * Returns true when a message is long / complex enough to plausibly contain
 * a decision statement.  Excludes greetings, reactions, media, questions,
 * status updates, personal actions, bullet lists, and meta-language.
 */
function isSubstantive(text: string): boolean {
  if (text.length < 15) return false;
  if (GREETING_RE.test(text)) return false;
  if (MEDIA_RE.test(text)) return false;
  if (/^\*.*deleted this message\*$/.test(text)) return false;
  if (isExcluded(text)) return false;
  return true;
}

/**
 * Returns true when a message is a short agreement / acknowledgment response.
 */
function isAgreement(text: string): boolean {
  return AGREEMENT_SHORT_RE.test(text) || AGREEMENT_EMOJI_RE.test(text);
}

/**
 * Returns true when a message contains language that is adjacent to a
 * decision (dates, imperative verbs, deadline words, etc.).
 * Used to lower the agreement threshold in the context window from 2 → 1.
 */
function isDecisionAdjacent(text: string): boolean {
  const lower = text.toLowerCase();
  if (DECISION_DATE_RE.test(lower)) return true;
  if (DECISION_ACTION_RE.test(lower)) return true;
  if (DECISION_SUMMARY_RE.test(text)) return true;
  if (
    /\b(we need|we must|needs to|has to|agreed|final|deadline|submit|internal)\b/i.test(
      lower,
    )
  )
    return true;
  return false;
}

export function extractDecisions(
  messages: MessageInput[],
): ExtractDecisionsResult {
  const items: DecisionItem[] = [];
  const evidenceByDecisionId: Record<string, string[]> = {};
  const seenIds = new Set<string>();

  for (const msg of messages) {
    const text = msg.message_text.trim();
    if (isExcluded(text)) continue;

    const lower = msg.message_text.toLowerCase();
    const status = detectDecisionStatus(lower, msg.message_text);
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

  // ── Second pass: context-window agreement detection ────────────────────────
  // When a substantive message is followed by short agreements from
  // different senders within the next 4 messages, treat it as a decision.
  const capturedHashes = new Set(Object.values(evidenceByDecisionId).flat());

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (capturedHashes.has(msg.message_hash)) continue;

    const text = msg.message_text.trim();
    if (!isSubstantive(text)) continue;

    let agreements = 0;
    const agreeSenders = new Set<string>();
    const windowHashes = [msg.message_hash];

    for (let j = i + 1; j < Math.min(i + 5, messages.length); j++) {
      const next = messages[j];
      if (next.sender === msg.sender) continue;
      if (isAgreement(next.message_text.trim())) {
        if (!agreeSenders.has(next.sender)) {
          agreements++;
          agreeSenders.add(next.sender);
          windowHashes.push(next.message_hash);
        }
      }
    }

    // 2+ agreements from different people → likely a decision.
    // 1 agreement is enough when the message itself contains decision-like language.
    // Always require decision-adjacent content to avoid catching pure
    // status updates and meta-discussion.
    if (!isDecisionAdjacent(text) && agreements < 2) continue;
    const needed = isDecisionAdjacent(text) ? 1 : 2;
    if (agreements >= needed) {
      const title = buildDecisionTitle(msg);
      const id = "dec_" + generateHash("decision|" + title).slice(0, 12);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      items.push({
        id,
        title,
        version: 1,
        status: "Tentative" as DecisionStatus,
        confidence: agreements >= 2 ? 65 : 55,
        explanation: truncate(`Agreed upon: "${text.split("\n")[0]}"`, 200),
        timestamp: msg.timestamp,
        lastUpdated: msg.timestamp,
      });
      evidenceByDecisionId[id] = windowHashes;
    }
  }

  return { items, evidenceByDecisionId };
}

// ─── Responsibility extraction ─────────────────────────────────────────────────

function detectResponsibilityTrigger(lower: string, original: string): boolean {
  // Skip meta-language: messages that list or quote trigger phrases
  if (META_LIST_RE.test(original)) return false;
  if (META_QUOTE_RE.test(original)) return false;

  if (RESP_SELF_RE.test(original)) return true;
  if (RESP_OTHER_RE.test(lower)) return true;
  // "please" only fires when followed closely by a concrete action verb
  if (RESP_PLEASE_ACTION_RE.test(original)) return true;
  for (const phrase of RESP_GENERAL_TRIGGER_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  // "deadline" only when task-like
  if (RESP_DEADLINE_RE.test(lower) && RESP_DEADLINE_ACTION_RE.test(lower)) {
    return true;
  }
  // Date reference + action word: "Submit by Friday", "Done by tomorrow"
  if (RESP_DATE_RE.test(lower) && RESP_DATE_ACTION_RE.test(lower)) {
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
  /** When true, existing decisions are updated in-place (same version) rather
   *  than creating a new version. Used by LLM enrichment so polishing a title
   *  doesn't produce a spurious v2. */
  enrichment?: boolean;
}): Promise<{
  threads_inserted: number;
  decisions_inserted: number;
  evidence_inserted: number;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = args.supabase as any;
  const { chat_id, decisions, evidenceByDecisionId, enrichment = false } = args;

  if (decisions.length === 0) {
    return { threads_inserted: 0, decisions_inserted: 0, evidence_inserted: 0 };
  }

  // ── Batch 1: Resolve all unique thread_keys upfront ─────────────────────
  const decToKey = new Map<string, string>();
  for (const dec of decisions) {
    const key =
      (dec as DecisionItem & { thread_key?: string }).thread_key ??
      slugify(dec.title);
    decToKey.set(dec.id, key);
  }
  const uniqueKeys = [...new Set(decToKey.values())];

  const { data: existingThreads } = await db
    .from("decision_threads")
    .select("id, thread_key")
    .eq("chat_id", chat_id)
    .in("thread_key", uniqueKeys);

  const threadByKey: Record<string, string> = {};
  if (existingThreads) {
    for (const t of existingThreads as { id: string; thread_key: string }[]) {
      threadByKey[t.thread_key] = t.id;
    }
  }

  // Insert missing threads in one batch
  const missingKeys = uniqueKeys.filter((k) => !threadByKey[k]);
  let threads_inserted = 0;
  if (missingKeys.length > 0) {
    const { data: newThreads } = await db
      .from("decision_threads")
      .insert(missingKeys.map((k) => ({ chat_id, thread_key: k })))
      .select("id, thread_key");
    if (newThreads) {
      for (const t of newThreads as { id: string; thread_key: string }[]) {
        threadByKey[t.thread_key] = t.id;
      }
      threads_inserted = newThreads.length;
    }
  }

  // ── Batch 2: Fetch latest version per thread in one query ───────────────
  const allThreadIds = [...new Set(Object.values(threadByKey))];
  const latestByThread: Record<
    string,
    {
      id: string;
      version_no: number;
      decision_title: string;
      status: string;
      confidence: number;
      final_outcome: string | null;
    }
  > = {};

  if (allThreadIds.length > 0) {
    const { data: allVersions } = await db
      .from("decisions")
      .select(
        "id, thread_id, version_no, decision_title, status, confidence, final_outcome",
      )
      .in("thread_id", allThreadIds)
      .order("version_no", { ascending: false });

    if (allVersions) {
      for (const d of allVersions as {
        id: string;
        thread_id: string;
        version_no: number;
        decision_title: string;
        status: string;
        confidence: number;
        final_outcome: string | null;
      }[]) {
        // Keep only the latest version per thread (first seen since ordered desc)
        if (!latestByThread[d.thread_id]) {
          latestByThread[d.thread_id] = d;
        }
      }
    }
  }

  // ── Batch 3: Resolve all evidence hashes → message IDs in one query ─────
  const allEvHashes = [...new Set(Object.values(evidenceByDecisionId).flat())];
  const msgByHash: Record<string, string> = {};

  if (allEvHashes.length > 0) {
    for (const chunk of chunkArray(allEvHashes, CHUNK_SIZE)) {
      const { data: msgRows } = await db
        .from("messages")
        .select("id, msg_sha256")
        .eq("chat_id", chat_id)
        .in("msg_sha256", chunk);
      if (msgRows) {
        for (const m of msgRows as { id: string; msg_sha256: string }[]) {
          msgByHash[m.msg_sha256] = m.id;
        }
      }
    }
  }

  // ── Build decision inserts / updates and evidence rows in memory ────────
  const decisionInserts: Array<{
    thread_id: string;
    version_no: number;
    status: string;
    confidence: number;
    decision_title: string;
    final_outcome: string;
    decided_at: string | null;
  }> = [];
  const insertIndexToDecId: string[] = [];

  // Enrichment-mode: collect UPDATEs for existing rows instead of inserting v2
  const decisionUpdates: Array<{
    existingDecisionId: string;
    decId: string; // original dec.id for evidence linking
    status: string;
    confidence: number;
    decision_title: string;
    final_outcome: string;
    decided_at: string | null;
  }> = [];

  for (const dec of decisions) {
    const thread_key = decToKey.get(dec.id)!;
    const thread_id = threadByKey[thread_key];
    if (!thread_id) continue;

    const latest = latestByThread[thread_id];

    if (latest) {
      const same =
        latest.decision_title === dec.title &&
        latest.status === dec.status &&
        latest.confidence === dec.confidence &&
        (latest.final_outcome ?? "") === (dec.explanation ?? "");
      if (same) continue; // identical content already stored

      if (enrichment) {
        // Enrichment mode: update the existing row in-place (no version bump)
        decisionUpdates.push({
          existingDecisionId: latest.id,
          decId: dec.id,
          status: dec.status,
          confidence: dec.confidence,
          decision_title: dec.title,
          final_outcome: dec.explanation,
          decided_at: dec.timestamp ?? null,
        });
        continue;
      }

      // Normal import: content changed → new version
      insertIndexToDecId.push(dec.id);
      decisionInserts.push({
        thread_id,
        version_no: latest.version_no + 1,
        status: dec.status,
        confidence: dec.confidence,
        decision_title: dec.title,
        final_outcome: dec.explanation,
        decided_at: dec.timestamp ?? null,
      });
    } else {
      // New thread — always insert v1
      insertIndexToDecId.push(dec.id);
      decisionInserts.push({
        thread_id,
        version_no: 1,
        status: dec.status,
        confidence: dec.confidence,
        decision_title: dec.title,
        final_outcome: dec.explanation,
        decided_at: dec.timestamp ?? null,
      });
    }
  }

  let decisions_inserted = 0;
  let evidence_inserted = 0;

  // ── Batch 4a: Enrichment updates (update existing rows in-place) ────────
  if (decisionUpdates.length > 0) {
    for (const upd of decisionUpdates) {
      await db
        .from("decisions")
        .update({
          status: upd.status,
          confidence: upd.confidence,
          decision_title: upd.decision_title,
          final_outcome: upd.final_outcome,
          decided_at: upd.decided_at,
        })
        .eq("id", upd.existingDecisionId);

      // Replace evidence: delete old links, insert new
      await db
        .from("decision_evidence")
        .delete()
        .eq("decision_id", upd.existingDecisionId);

      const hashes = evidenceByDecisionId[upd.decId] ?? [];
      const evidenceRows = hashes
        .map((h) => msgByHash[h])
        .filter(Boolean)
        .map((msg_id) => ({
          decision_id: upd.existingDecisionId,
          message_id: msg_id,
        }));

      if (evidenceRows.length > 0) {
        await db.from("decision_evidence").insert(evidenceRows);
        evidence_inserted += evidenceRows.length;
      }
    }
    decisions_inserted += decisionUpdates.length;
  }

  // ── Batch 4b: Insert genuinely new decisions ────────────────────────────
  if (decisionInserts.length > 0) {
    const { data: decRows, error: decErr } = await db
      .from("decisions")
      .insert(decisionInserts)
      .select("id");

    if (decErr || !decRows) {
      console.error("decisions batch insert error:", decErr?.message);
      return { threads_inserted, decisions_inserted, evidence_inserted };
    }

    decisions_inserted += decRows.length;

    // ── Batch 5: Insert all evidence rows at once ─────────────────────────
    const allEvidenceRows: Array<{
      decision_id: string;
      message_id: string;
    }> = [];

    for (let i = 0; i < decRows.length; i++) {
      const decision_id = (decRows[i] as { id: string }).id;
      const origDecId = insertIndexToDecId[i];
      const hashes = evidenceByDecisionId[origDecId] ?? [];
      for (const h of hashes) {
        const msg_id = msgByHash[h];
        if (msg_id) {
          allEvidenceRows.push({ decision_id, message_id: msg_id });
        }
      }
    }

    if (allEvidenceRows.length > 0) {
      for (const chunk of chunkArray(allEvidenceRows, CHUNK_SIZE)) {
        await db.from("decision_evidence").insert(chunk, {
          onConflict: "decision_id,message_id",
          ignoreDuplicates: true,
        });
      }
      evidence_inserted += allEvidenceRows.length;
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

  // ── Batch 1: Resolve all evidence hashes → message IDs in one query ─────
  const allHashes = [
    ...new Set(Object.values(evidenceByResponsibilityId).flat()),
  ];
  const msgByHash: Record<string, string> = {};

  if (allHashes.length > 0) {
    for (const chunk of chunkArray(allHashes, CHUNK_SIZE)) {
      const { data: msgRows } = await db
        .from("messages")
        .select("id, msg_sha256")
        .eq("chat_id", chat_id)
        .in("msg_sha256", chunk);
      if (msgRows) {
        for (const m of msgRows as { id: string; msg_sha256: string }[]) {
          msgByHash[m.msg_sha256] = m.id;
        }
      }
    }
  }

  // ── Batch 2: Fetch all existing responsibilities for dedup ──────────────
  const { data: existingResps } = await db
    .from("responsibilities")
    .select("owner, task_text")
    .eq("chat_id", chat_id);

  const existingKeys = new Set<string>();
  if (existingResps) {
    for (const r of existingResps as { owner: string; task_text: string }[]) {
      existingKeys.add(r.owner + "\0" + r.task_text);
    }
  }

  // ── Build insert rows in memory, skipping duplicates ────────────────────
  const insertRows: Array<{
    chat_id: string;
    owner: string;
    task_text: string;
    status: string;
    due_date: string | null;
    source_message_id: string | null;
  }> = [];

  for (const resp of responsibilities) {
    const task_text =
      resp.title + (resp.description ? " \u2014 " + resp.description : "");
    const dedupKey = resp.owner + "\0" + task_text;

    if (existingKeys.has(dedupKey)) continue;
    existingKeys.add(dedupKey); // prevent intra-batch duplicates

    const hashes = evidenceByResponsibilityId[resp.id] ?? [];
    const source_message_id =
      hashes.length > 0 ? (msgByHash[hashes[0]] ?? null) : null;

    insertRows.push({
      chat_id,
      owner: resp.owner,
      task_text,
      status: resp.status,
      due_date: resp.due && resp.due.trim() !== "" ? resp.due : null,
      source_message_id,
    });
  }

  // ── Batch 3: Insert all at once ─────────────────────────────────────────
  let inserted = 0;
  if (insertRows.length > 0) {
    for (const chunk of chunkArray(insertRows, CHUNK_SIZE)) {
      const { data, error } = await db
        .from("responsibilities")
        .insert(chunk)
        .select("id");
      if (error) {
        console.error("responsibilities batch insert error:", error.message);
      }
      inserted += data?.length ?? 0;
    }
  }

  return { inserted };
}