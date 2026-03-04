/**
 * lib/llm.ts
 *
 * LLM integration for decision and responsibility extraction.
 * Primary:  OpenRouter — arcee-ai/trinity-large-preview:free (131K context, free tier).
 * Fallback: Groq — llama-3.3-70b-versatile (OpenAI-compatible, no billing required).
 * Uses native fetch — no additional npm dependencies.
 *
 * The only export consumed by orchestrate.ts is runLLMOnMessages().
 * Everything else is internal.
 */

import { MessageInput } from "./decisionEngine";

// ─── Output types ───────────────────────────────────────────────────────────

/** A previously-tracked decision passed to the LLM so it can reuse thread_keys. */
export type ExistingDecision = {
  thread_key: string;
  title: string;
  version: number;
};

export type LLMDecision = {
  /** URL-safe slug that groups related messages into the same decision thread. */
  thread_key: string;
  /** Concise decision title, ≤80 chars. */
  title: string;
  status: "Final" | "Tentative";
  /** 0–100. Higher = more definitive language. */
  confidence: number;
  /** Why this is a decision, ≤200 chars. */
  explanation: string;
  /** ISO timestamp of the source message. */
  decided_at: string;
  /** msg_sha256 values from input messages used as evidence. */
  evidence_hashes: string[];
};

export type LLMResponsibility = {
  /** Task description, ≤80 chars. */
  title: string;
  /** Exact sender name, or "unassigned". */
  owner: string;
  /** YYYY-MM-DD parsed from natural language, or "". */
  due: string;
  /** 1–2 sentence summary of the task. */
  description: string;
  /** Single msg_sha256 from the input messages. */
  evidence_hash: string;
};

export type LLMChunkResult = {
  decisions: LLMDecision[];
  responsibilities: LLMResponsibility[];
};

export type LLMOutput = {
  decisions: LLMDecision[];
  responsibilities: LLMResponsibility[];
  /** Which provider succeeded. null = both failed, deterministic-only mode. */
  provider: "openrouter" | "groq" | null;
};

// ─── System prompt ────────────────────────────────────────────────────────────

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

EXPLANATION: context + outcome + reasoning, max 300 chars. NOT a copy of any message.

STATUS: Final = definitive ("decided / going with / locked in / approved"). Tentative = directional ("let's try / I suggest / we should").

CONFIDENCE: 90-100 explicit | 70-89 strong signal | 50-69 moderate | 30-49 weak.

DECIDED_AT: timestamp of the message that STATES the outcome.

THREAD_KEY: lowercase a-z 0-9 underscore, max 64 chars. Same topic = same key.

MERGING DUPLICATES: If two or more draft decisions are about the same topic, output ONE decision with all their evidence messages combined in evidence_hashes.

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

If "existing_decisions" is present, it lists decisions already saved from a previous run.
For each decision you output:
  • Same topic as an existing one → use its EXACT thread_key.
  • New topic → invent a fresh thread_key.
The backend compares content to detect changes and assigns v2/v3 automatically.

━━━

No results? Return exactly: {"decisions":[],"responsibilities":[]}`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

export type PromptBuild = {
  systemPrompt: string;
  userContent: string;
  idToHash: Record<string, string>;
};

/**
 * Builds the LLM prompt.
 * Sends draft decisions/responsibilities from the deterministic engine
 * along with the chat messages so the LLM can improve them.
 */
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

  // Convert draft evidence hashes (sha256) to short ids (m000…)
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

// ─── JSON validation ──────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Validates and sanitizes a raw parsed JSON object into a safe LLMChunkResult.
 * Drops malformed items rather than throwing — a partial result is better than nothing.
 * `idToHash` maps short sequential IDs (m000, m001…) back to real msg_sha256 hashes.
 */
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
  // Strip markdown fences if the model wraps output despite instructions
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped);
}

// ─── Retry helpers ────────────────────────────────────────────────────────────

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries `fn` up to `maxAttempts` times when it throws an error whose message
 * contains "429".  Reads a `Retry-After` (seconds) value from the thrown
 * message if present; otherwise uses exponential back-off starting at 8 s.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("429")) throw err; // non-rate-limit error — don't retry
      // Try to honour the Retry-After header value embedded in the error message
      const retryAfterMatch = msg.match(/"retryAfter"\s*:\s*(\d+)/i);
      const waitMs = retryAfterMatch
        ? parseInt(retryAfterMatch[1], 10) * 1_000 + 500
        : 8_000 * 2 ** attempt; // 8 s, 16 s, 32 s
      console.warn(
        `llm: 429 rate limit (attempt ${attempt + 1}/${maxAttempts}), waiting ${waitMs / 1_000}s…`,
      );
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

// ─── API callers ──────────────────────────────────────────────────────────────

async function callOpenRouter(
  systemPrompt: string,
  userContent: string,
  idToHash: Record<string, string> = {},
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
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
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

// ─── Fallback chain ───────────────────────────────────────────────────────────

/**
 * Tries OpenRouter (arcee-ai/trinity-large-preview:free, 131K context) first, then Groq as fallback.
 * `failed` is a shared Set across chunks — if a provider hard-fails once,
 * it is added to `failed` and skipped for all remaining chunks.
 */
async function callWithFallback(
  systemPrompt: string,
  userContent: string,
  failed: Set<string>,
  idToHash: Record<string, string> = {},
): Promise<{ result: LLMChunkResult; provider: "openrouter" | "groq" } | null> {
  if (!failed.has("openrouter")) {
    try {
      const result = await withRetry(
        () => callOpenRouter(systemPrompt, userContent, idToHash),
        2,
      );
      return { result, provider: "openrouter" };
    } catch (err) {
      console.warn(
        "llm: OpenRouter failed, trying Groq:",
        err instanceof Error ? err.message : err,
      );
      failed.add("openrouter");
    }
  }

  if (!failed.has("groq")) {
    try {
      const result = await withRetry(
        () => callGroq(systemPrompt, userContent, idToHash),
        2,
      );
      return { result, provider: "groq" };
    } catch (err) {
      console.warn(
        "llm: Groq failed, falling back to deterministic only:",
        err instanceof Error ? err.message : err,
      );
      failed.add("groq");
    }
  }

  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Chats at or below this size are sent in a single LLM call to conserve
 * free-tier request quotas.
 * Above this threshold the messages are split into chunks.
 */
const SINGLE_CALL_THRESHOLD = 700;

/** Messages per chunk when the chat exceeds SINGLE_CALL_THRESHOLD. */
const LLM_CHUNK_SIZE = 200;

/** Pause between consecutive chunk calls to avoid RPM quota exhaustion. */
const INTER_CHUNK_DELAY_MS = 3_000;

/**
 * Runs the LLM extraction pipeline over all messages.
 *
 * Strategy:
 *   ≤ SINGLE_CALL_THRESHOLD messages → one API call (conserves free-tier quota)
 *   >  SINGLE_CALL_THRESHOLD messages → sequential chunks of LLM_CHUNK_SIZE
 *
 * Returns combined decisions + responsibilities + which provider was used.
 * Returns provider=null if all providers failed (deterministic-only mode).
 */
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
  /** Providers that have permanently failed — skip for all remaining chunks. */
  const failedProviders = new Set<string>();

  const chunks: MessageInput[][] =
    messages.length <= SINGLE_CALL_THRESHOLD
      ? [messages] // single call — don't waste quota on small chats
      : Array.from(
          { length: Math.ceil(messages.length / LLM_CHUNK_SIZE) },
          (_, i) =>
            messages.slice(i * LLM_CHUNK_SIZE, (i + 1) * LLM_CHUNK_SIZE),
        );

  for (let i = 0; i < chunks.length; i++) {
    // All providers exhausted — no point processing remaining chunks
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
    );

    if (!outcome) continue; // both providers failed for this chunk — skip it

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
