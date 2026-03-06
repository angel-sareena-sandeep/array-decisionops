/**
 * LLM integration helpers.
 */

import { MessageInput } from "./decisionEngine";

// Output types

/** Existing decision context for thread reuse. */
export type ExistingDecision = {
  thread_key: string;
  title: string;
  version: number;
};

export type LLMDecision = {
  /** Decision thread key. */
  thread_key: string;
  /** Decision title. */
  title: string;
  status: "Final" | "Tentative";
  /** Confidence 0-100. */
  confidence: number;
  /** Short explanation. */
  explanation: string;
  /** Source timestamp (ISO). */
  decided_at: string;
  /** Evidence message hashes. */
  evidence_hashes: string[];
};

export type LLMResponsibility = {
  /** Task title. */
  title: string;
  /** Owner or "unassigned". */
  owner: string;
  /** Due date or empty. */
  due: string;
  /** Short task description. */
  description: string;
  /** Evidence hash. */
  evidence_hash: string;
};

export type LLMChunkResult = {
  decisions: LLMDecision[];
  responsibilities: LLMResponsibility[];
};

export type LLMOutput = {
  decisions: LLMDecision[];
  responsibilities: LLMResponsibility[];
  /** Provider used, or null on failure. */
  provider: "openrouter" | "groq" | null;
};

// System prompt

const SYSTEM_PROMPT = `You are an AI that IMPROVES and ENRICHES decisions and responsibilities extracted from a WhatsApp group chat by a rules-based system.

You will receive:
  1. "draft_decisions" — decisions extracted by the rules engine. They may contain duplicates, vague titles copied from messages, or overlapping entries about the same topic.
  2. "draft_responsibilities" — responsibilities extracted by the rules engine. Same issues.
  3. "messages" — the full WhatsApp chat for context.
  4. (optional) "existing_decisions" — decisions already saved in the database from a previous enrichment. Used ONLY for thread_key reuse and version detection.

YOUR JOB:
  Read the chat messages for context. Then output a CLEAN, IMPROVED set of decisions and responsibilities.
  - Merge duplicates (two drafts about the same topic → one decision).
  - Rewrite vague titles into clear factual statements.
  - Add any decisions or responsibilities the rules engine MISSED.
  - Remove false positives (drafts that aren't real decisions).
  - Assign proper confidence, status, and evidence.

Output valid JSON only — no markdown, no prose, no explanation.

OUTPUT FORMAT:
{"decisions":[{"thread_key":"snake_case_slug","title":"Factual statement ≤80 chars","status":"Final|Tentative","confidence":0-100,"explanation":"1-3 sentences ≤300 chars","decided_at":"ISO8601","evidence_hashes":["m000"]}],"responsibilities":[{"title":"Action ≤80 chars","owner":"Person or unassigned","due":"YYYY-MM-DD or empty","description":"1-2 sentences","evidence_hash":"m000"}]}

━━━ MESSAGE IDs ━━━
Each message has an "id" (m000, m001…). Use ONLY these in evidence_hashes / evidence_hash.

━━━ DECISIONS ━━━

For each draft decision, read the relevant chat messages and decide:
  • Is it a real decision? (concrete outcome: a choice, deadline, person, or approach agreed on)
    → If NO: drop it.
    → If YES: improve it.

TITLE: factual statement of WHAT was decided, max 80 chars. Write in your own words.
  ✗ "we're using the university HPC cluster for the final training run, confirmed access" (copied message)
  ✓ "University HPC cluster selected for final training run"

EXPLANATION: Two parts, max 300 chars total. NOT a copy of any message.
  Part 1 — WHAT: Summarise the decision context and outcome in 1-2 sentences.
  Part 2 — WHY this status: End with "Final because …" or "Tentative because …".
  Example: "Internal submission deadline set to March 4, one day before the competition closes. Final because all three members explicitly confirmed."
  Example: "Backend target date proposed as Feb 24. Tentative because it was marked contingent on re-import tests passing."

STATUS: Final = definitive ("decided / going with / locked in / approved"). Tentative = directional ("let's try / I suggest / we should").

CONFIDENCE: How certain/final the decision is. Tentative decisions MUST score lower than Final ones.
  Final:     80-100 (explicit agreement from multiple people) | 70-79 (clear but not unanimous).
  Tentative: 50-69  (directional, proposed, or conditional)   | 30-49 (vague or weakly implied).
  A Tentative decision should NEVER exceed 69.

DECIDED_AT: timestamp of the message that STATES the outcome.

THREAD_KEY: lowercase a-z 0-9 underscore, max 64 chars.
  • Same topic = SAME key — even if the outcome changed over time (e.g. deadline moved, choice changed).
  • Group all messages about the same underlying question under one thread_key.
  • Output only ONE decision per thread_key (the latest/most resolved one).
  • Do NOT create separate decisions for "proposal" + "final answer" on the same topic — merge them into one.

MERGING DUPLICATES: If two or more draft decisions are about the same topic (even if worded differently or the outcome evolved), output ONE decision using the LATEST outcome, with ALL their evidence messages combined in evidence_hashes.

Also: if you find decisions in the chat that the rules engine missed entirely, ADD them.

━━━ RESPONSIBILITIES ━━━

For each draft responsibility, read the relevant message and decide:
  • Is it a real action item? (concrete task with owner or deadline)
    → If NO: drop it.
    → If YES: improve it.

TITLE: what needs to be done, max 80 chars. Active verb + object. NOT a copy of the message.
  ✗ "I'll prepare the slides and add everything before we meet"
  ✓ "Prepare slide deck for the demo"

DESCRIPTION: 1-2 sentences clarifying scope/context. NOT a copy of the message.

OWNER: exact name from the chat. "unassigned" only if truly unclear.

DUE: convert relative dates to YYYY-MM-DD based on message timestamp. Empty if none.

EVIDENCE_HASH: single message id most directly stating the task.

Also: if you find responsibilities in the chat that the rules engine missed, ADD them.

━━━ VERSIONING ━━━

If "existing_decisions" is present, it lists decisions already saved from a previous import.
For each decision you output:
  • Same topic as an existing one → you MUST use its EXACT thread_key, no exceptions.
  • New topic not in existing_decisions → invent a fresh thread_key.
The backend detects whether the content changed and automatically assigns v2/v3.
NEVER invent a new thread_key for a topic that already exists — that creates a duplicate instead of a version.

━━━

No results? Return exactly: {"decisions":[],"responsibilities":[]}`;

// Prompt builder

export type PromptBuild = {
  systemPrompt: string;
  userContent: string;
  idToHash: Record<string, string>;
};

/** Build prompt payload and hash map. */
export function buildPrompt(
  chunk: MessageInput[],
  draftDecisions: Array<{
    title: string;
    status: string;
    confidence: number;
    evidence_hashes: string[];
  }> = [],
  draftResponsibilities: Array<{
    title: string;
    owner: string;
    description: string;
    evidence_hash: string;
  }> = [],
  existingDecisions: ExistingDecision[] = [],
): PromptBuild {
  const idToHash: Record<string, string> = {};
  const hashToId: Record<string, string> = {};
  const msgs = chunk.map((m, i) => {
    const id = `m${String(i).padStart(3, "0")}`;
    idToHash[id] = m.message_hash;
    hashToId[m.message_hash] = id;
    return { id, sender: m.sender, text: m.message_text, ts: m.timestamp };
  });

  // Map evidence hashes to short IDs
  const draftsWithShortIds = draftDecisions.map((d) => ({
    ...d,
    evidence_hashes: d.evidence_hashes.map((h) => hashToId[h] ?? h),
  }));
  const respDraftsWithShortIds = draftResponsibilities.map((r) => ({
    ...r,
    evidence_hash: hashToId[r.evidence_hash] ?? r.evidence_hash,
  }));

  const payload: Record<string, unknown> = {
    messages: msgs,
    draft_decisions: draftsWithShortIds,
    draft_responsibilities: respDraftsWithShortIds,
  };
  if (existingDecisions.length > 0) {
    payload.existing_decisions = existingDecisions;
  }

  return {
    systemPrompt: SYSTEM_PROMPT,
    userContent: JSON.stringify(payload),
    idToHash,
  };
}

// JSON validation

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Validate raw model JSON into safe output. */
export function validateLLMResult(
  raw: unknown,
  idToHash: Record<string, string> = {},
): LLMChunkResult {
  if (!raw || typeof raw !== "object") {
    return { decisions: [], responsibilities: [] };
  }
  const obj = raw as Record<string, unknown>;

  const decisions: LLMDecision[] = [];
  if (Array.isArray(obj.decisions)) {
    for (const item of obj.decisions) {
      if (!item || typeof item !== "object") continue;
      const d = item as Record<string, unknown>;
      if (
        !isString(d.thread_key) ||
        d.thread_key.trim() === "" ||
        !isString(d.title) ||
        d.title.trim() === "" ||
        (d.status !== "Final" && d.status !== "Tentative") ||
        typeof d.confidence !== "number" ||
        !Array.isArray(d.evidence_hashes)
      ) {
        continue;
      }
      decisions.push({
        thread_key: d.thread_key
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 64),
        title: String(d.title).slice(0, 80),
        status: d.status as "Final" | "Tentative",
        confidence: Math.max(0, Math.min(100, Math.round(d.confidence))),
        explanation: isString(d.explanation) ? d.explanation.slice(0, 300) : "",
        decided_at: isString(d.decided_at) ? d.decided_at : "",
        evidence_hashes: (d.evidence_hashes as unknown[])
          .filter(isString)
          .map((id) => idToHash[id as string] ?? (id as string)),
      });
    }
  }

  const responsibilities: LLMResponsibility[] = [];
  if (Array.isArray(obj.responsibilities)) {
    for (const item of obj.responsibilities) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (
        !isString(r.title) ||
        r.title.trim() === "" ||
        !isString(r.evidence_hash) ||
        r.evidence_hash.trim() === ""
      ) {
        continue;
      }
      responsibilities.push({
        title: String(r.title).slice(0, 80),
        owner:
          isString(r.owner) && r.owner.trim() !== "" ? r.owner : "unassigned",
        due: isString(r.due) ? r.due : "",
        description: isString(r.description) ? r.description : "",
        evidence_hash: idToHash[r.evidence_hash] ?? r.evidence_hash,
      });
    }
  }

  return { decisions, responsibilities };
}

function extractJSON(text: string): unknown {
  // Remove optional markdown fences
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped);
}

// Timeout helpers

/** Base timeout. */
const BASE_TIMEOUT_MS = 60_000;
/** Extra time per 100 messages. */
const TIMEOUT_PER_100_MSGS_MS = 15_000;
/** Max timeout. */
const MAX_TIMEOUT_MS = 180_000;

/** Compute timeout from message count. */
function computeTimeout(messageCount: number): number {
  const scaled =
    BASE_TIMEOUT_MS + Math.ceil(messageCount / 100) * TIMEOUT_PER_100_MSGS_MS;
  return Math.min(scaled, MAX_TIMEOUT_MS);
}

// Retry helpers

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry on 429 with backoff. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("429")) throw err; // non-rate-limit error
      // Use Retry-After when present
      const retryAfterMatch = msg.match(/"retryAfter"\s*:\s*(\d+)/i);
      const waitMs = retryAfterMatch
        ? parseInt(retryAfterMatch[1], 10) * 1_000 + 500
        : 8_000 * 2 ** attempt; // backoff
      console.warn(
        `llm: 429 rate limit (attempt ${attempt + 1}/${maxAttempts}), waiting ${waitMs / 1_000}s…`,
      );
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

// API callers

async function callOpenRouter(
  systemPrompt: string,
  userContent: string,
  idToHash: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<LLMChunkResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://array-decisionops.vercel.app",
      "X-Title": "Array DecisionOps",
    },
    body: JSON.stringify({
      model: "arcee-ai/trinity-large-preview:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned empty content");

  const rawParsed = extractJSON(text);
  const rawObj = rawParsed as Record<string, unknown> | null;
  console.log(
    `llm [OpenRouter] raw: decisions=${
      Array.isArray(rawObj?.decisions)
        ? (rawObj!.decisions as unknown[]).length
        : "MISSING"
    }, responsibilities=${
      Array.isArray(rawObj?.responsibilities)
        ? (rawObj!.responsibilities as unknown[]).length
        : "MISSING"
    }`,
  );
  const validated = validateLLMResult(rawParsed, idToHash);
  console.log(
    `llm [OpenRouter] validated: decisions=${validated.decisions.length}, responsibilities=${validated.responsibilities.length}`,
  );
  return validated;
}

async function callGroq(
  systemPrompt: string,
  userContent: string,
  idToHash: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<LLMChunkResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key_here") {
    throw new Error("GROQ_API_KEY not configured");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty content");

  const rawParsed = extractJSON(text);
  const rawObj = rawParsed as Record<string, unknown> | null;
  console.log(
    `llm [Groq] raw: decisions=${
      Array.isArray(rawObj?.decisions)
        ? (rawObj!.decisions as unknown[]).length
        : "MISSING"
    }, responsibilities=${
      Array.isArray(rawObj?.responsibilities)
        ? (rawObj!.responsibilities as unknown[]).length
        : "MISSING"
    }`,
  );
  const validated = validateLLMResult(rawParsed, idToHash);
  console.log(
    `llm [Groq] validated: decisions=${validated.decisions.length}, responsibilities=${validated.responsibilities.length}`,
  );
  return validated;
}

// Fallback chain

/** Try OpenRouter first, then Groq. */
async function callWithFallback(
  systemPrompt: string,
  userContent: string,
  failed: Set<string>,
  idToHash: Record<string, string> = {},
  messageCount: number = 0,
): Promise<{ result: LLMChunkResult; provider: "openrouter" | "groq" } | null> {
  const timeoutMs = computeTimeout(messageCount);

  if (!failed.has("openrouter")) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const result = await withRetry(
        () => callOpenRouter(systemPrompt, userContent, idToHash, ac.signal),
        2,
      );
      clearTimeout(timer);
      return { result, provider: "openrouter" };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = ac.signal.aborted;
      console.warn(
        `llm: OpenRouter ${isTimeout ? `timed out after ${timeoutMs / 1_000}s` : "failed"}, trying Groq:`,
        err instanceof Error ? err.message : err,
      );
      failed.add("openrouter");
    }
  }

  if (!failed.has("groq")) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const result = await withRetry(
        () => callGroq(systemPrompt, userContent, idToHash, ac.signal),
        2,
      );
      clearTimeout(timer);
      return { result, provider: "groq" };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = ac.signal.aborted;
      console.warn(
        `llm: Groq ${isTimeout ? `timed out after ${timeoutMs / 1_000}s` : "failed"}, falling back to deterministic only:`,
        err instanceof Error ? err.message : err,
      );
      failed.add("groq");
    }
  }

  return null;
}

// Main entry point

/** Use one call at or below this size. */
const SINGLE_CALL_THRESHOLD = 700;

/** Chunk size above threshold. */
const LLM_CHUNK_SIZE = 200;

/** Delay between chunk calls. */
const INTER_CHUNK_DELAY_MS = 3_000;

/** Run LLM extraction for all messages. */
export async function runLLMOnMessages(
  messages: MessageInput[],
  draftDecisions: Array<{
    title: string;
    status: string;
    confidence: number;
    evidence_hashes: string[];
  }> = [],
  draftResponsibilities: Array<{
    title: string;
    owner: string;
    description: string;
    evidence_hash: string;
  }> = [],
  existingDecisions: ExistingDecision[] = [],
): Promise<LLMOutput> {
  const allDecisions: LLMDecision[] = [];
  const allResponsibilities: LLMResponsibility[] = [];
  let provider: "openrouter" | "groq" | null = null;
  /** Providers to skip after failure. */
  const failedProviders = new Set<string>();

  const chunks: MessageInput[][] =
    messages.length <= SINGLE_CALL_THRESHOLD
      ? [messages] // single call for small chats
      : Array.from(
          { length: Math.ceil(messages.length / LLM_CHUNK_SIZE) },
          (_, i) =>
            messages.slice(i * LLM_CHUNK_SIZE, (i + 1) * LLM_CHUNK_SIZE),
        );

  for (let i = 0; i < chunks.length; i++) {
    // Stop if all providers failed
    if (failedProviders.size >= 2) break;

    if (i > 0) await sleep(INTER_CHUNK_DELAY_MS);

    const { systemPrompt, userContent, idToHash } = buildPrompt(
      chunks[i],
      draftDecisions,
      draftResponsibilities,
      existingDecisions,
    );
    const outcome = await callWithFallback(
      systemPrompt,
      userContent,
      failedProviders,
      idToHash,
      chunks[i].length,
    );

    if (!outcome) continue; // skip failed chunk

    if (provider === null) provider = outcome.provider;
    allDecisions.push(...outcome.result.decisions);
    allResponsibilities.push(...outcome.result.responsibilities);
  }

  return {
    decisions: allDecisions,
    responsibilities: allResponsibilities,
    provider,
  };
}