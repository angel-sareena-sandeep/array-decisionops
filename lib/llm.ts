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

// ─── Output types ──────────────────────────────────────────────────────────────

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

const SYSTEM_PROMPT = `You are an AI assistant that extracts decisions and action items (responsibilities) from WhatsApp group chat messages.

You will receive a JSON array of messages. Each message has:
- hash: unique message identifier (msg_sha256)
- sender: the person who sent it
- text: the message content
- ts: ISO 8601 timestamp

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. The object must match this exact structure:

{
  "decisions": [
    {
      "thread_key": "url_safe_slug_max_64_chars",
      "title": "Team agreed to use Supabase for the database",
      "status": "Final",
      "confidence": 85,
      "explanation": "After comparing Firebase and Supabase, the team chose Supabase for its Postgres support and free tier. Confirmed by all members on Feb 18.",
      "decided_at": "2026-02-18T14:30:00.000Z",
      "evidence_hashes": ["m000", "m003"]
    }
  ],
  "responsibilities": [
    {
      "title": "task description max 80 chars",
      "owner": "Sender Name",
      "due": "2026-02-23",
      "description": "1-2 sentence summary of what needs to be done",
      "evidence_hash": "m001"
    }
  ]
}

IMPORTANT: Each message in the input has an "id" field like "m000", "m001", etc.
Use those exact id values in evidence_hashes and evidence_hash. DO NOT use any other value.

RULES FOR DECISIONS — READ CAREFULLY:

RULE 1 — STANDALONE OUTCOME REQUIRED:
A decision MUST contain a clear, standalone outcome statement describing WHAT was decided.
The title must answer "what did the group decide?" in a complete phrase.
BAD:  "agreed", "confirmed", "done", "ok", "perfect", "sorted", "yes", "👍"
GOOD: "Backend deployment moved to Feb 18", "Team agreed to use Supabase for the database", "Launch date set for March 1"

RULE 2 — DO NOT EXTRACT BARE REACTIONS:
DO NOT extract acknowledgements, single-word confirmations, or reactions as standalone decisions.
This includes: "agreed", "ok", "done", "yes", "perfect", "👍", "✅", "sounds good", "sure", "noted".
If the full decision content is NOT restated in the same message, it is NOT a decision — skip it entirely.

RULE 3 — CONFIRMATIONS ARE EVIDENCE, NOT NEW DECISIONS:
If a message is only confirming or reacting to a prior decision in the same input, DO NOT create a new decision for it.
Instead, add its hash to the evidence_hashes of the original decision it is confirming.
Example: if message A says "we're going with React" and message B says "agreed 👍", message B is evidence for message A's decision — not its own decision.

RULE 4 — THREAD KEYS GROUP RELATED MESSAGES:
thread_key: lowercase, letters/numbers/underscores only, max 64 chars.
All messages about the same topic MUST share the same thread_key (e.g. "api_provider_choice", "launch_date", "frontend_framework").

RULE 5 — TITLE AND EXPLANATION QUALITY:
title: Write a complete, standalone sentence describing WHAT was decided. Max 80 chars.
  BAD:  "Backend", "Agreed on deployment", "Feb 18"
  GOOD: "Backend deployment deadline set for Feb 18", "Team will use React for the frontend"
explanation: Write 1-3 sentences describing the decision context and outcome: what options were considered (if visible), what was chosen, and why (if stated). Max 300 chars.
  BAD:  "Decision based on: agreed"
  GOOD: "After discussing React vs Vue, the team chose React due to existing experience. Confirmed by all three members."

RULE 6 — STATUS AND CONFIDENCE:
status "Final": language is definitive — "we decided", "going with X", "locked in", "we will use", "approved".
status "Tentative": language is directional but not locked — "let's try", "thinking of", "proposal", "I suggest", "we should".
confidence 90–100: explicit declaration. 70–89: strong signal. 50–69: moderate. 30–49: weak signal.
DO NOT assign confidence above 49 to a bare reaction message even if it seems to confirm something.

RULE 7 — TIMESTAMPS:
decided_at: use the "ts" of the message that states the actual decision outcome (not the earliest reaction to it).

RULES FOR RESPONSIBILITIES:
- Only extract concrete action items assigned to a person or needed by a deadline.
- owner: the exact sender name if they are committing ("I will", "I'll", "let me"), or the name being addressed ("can you X"). Use "unassigned" only if no person is identifiable.
- due: parse natural-language dates relative to the message's "ts" field into YYYY-MM-DD. Empty string if no deadline.
- evidence_hash: the single most relevant message hash.

ABSOLUTE DO NOT EXTRACT LIST:
- Questions without answers
- Greetings, emoji reactions, or acknowledgements with no content
- Status updates with no action or decision
- Casual conversation
- Any message whose entire text is a single word or emoji that does not restate a full outcome

If there are no decisions or responsibilities, return: {"decisions":[],"responsibilities":[]}`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

export type PromptBuild = { prompt: string; idToHash: Record<string, string> };

export function buildPrompt(chunk: MessageInput[]): PromptBuild {
  const idToHash: Record<string, string> = {};
  const msgs = chunk.map((m, i) => {
    const id = `m${String(i).padStart(3, "0")}`;
    idToHash[id] = m.message_hash;
    return { id, sender: m.sender, text: m.message_text, ts: m.timestamp };
  });
  return {
    prompt: `${SYSTEM_PROMPT}\n\nMessages:\n${JSON.stringify(msgs)}`,
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
        !isString(d.decided_at) ||
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
        decided_at: d.decided_at,
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
  prompt: string,
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
      messages: [{ role: "user", content: prompt }],
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

  return validateLLMResult(extractJSON(text), idToHash);
}

async function callGroq(
  prompt: string,
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
      messages: [{ role: "user", content: prompt }],
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

  return validateLLMResult(extractJSON(text), idToHash);
}

// ─── Fallback chain ───────────────────────────────────────────────────────────

/**
 * Tries OpenRouter (arcee-ai/trinity-large-preview:free, 131K context) first, then Groq as fallback.
 * `failed` is a shared Set across chunks — if a provider hard-fails once,
 * it is added to `failed` and skipped for all remaining chunks.
 */
async function callWithFallback(
  prompt: string,
  failed: Set<string>,
  idToHash: Record<string, string> = {},
): Promise<{ result: LLMChunkResult; provider: "openrouter" | "groq" } | null> {
  if (!failed.has("openrouter")) {
    try {
      const result = await withRetry(() => callOpenRouter(prompt, idToHash), 2);
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
      const result = await withRetry(() => callGroq(prompt, idToHash), 2);
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

    const { prompt, idToHash } = buildPrompt(chunks[i]);
    const outcome = await callWithFallback(prompt, failedProviders, idToHash);

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