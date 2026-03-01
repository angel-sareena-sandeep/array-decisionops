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

const SYSTEM_PROMPT = `You extract DECISIONS and RESPONSIBILITIES from WhatsApp group chat messages. Output valid JSON only — no markdown, no prose, no explanation.

OUTPUT FORMAT (return this exact structure, no other text):
{"decisions":[{"thread_key":"snake_case_slug","title":"Complete sentence ≤80 chars","status":"Final|Tentative","confidence":0-100,"explanation":"1-3 sentences ≤300 chars","decided_at":"ISO8601","evidence_hashes":["m000"]}],"responsibilities":[{"title":"Action description ≤80 chars","owner":"Person name or unassigned","due":"YYYY-MM-DD or empty string","description":"1-2 sentences","evidence_hash":"m000"}]}

Message IDs: each input message has an "id" field (m000, m001…). Use ONLY these short IDs in evidence_hashes and evidence_hash — never copy any other value.

━━━ DECISIONS ━━━

BEFORE extracting, apply this filter: "What specific thing did this group decide?"
If the answer is a vague word or reaction with no concrete content → SKIP entirely.
Always skip: single-word replies / bare reactions ("agreed", "ok", "done", "sure", "noted", "👍", "✅") / questions / greetings / status updates with no resolution.

EXTRACT when a message contains a concrete, specific outcome: a choice made, a deadline set, a person/tool/approach agreed on.

TITLE: complete sentence stating WHAT was decided, max 80 chars.
  ✗ "Agreed on frontend"  ✓ "Team chose React for the frontend framework"

EXPLANATION: context + outcome + reasoning if visible, max 300 chars.
  ✗ "Decision based on: agreed"  ✓ "After comparing React and Vue, the team chose React due to prior experience. All three members confirmed."

STATUS: Final = definitive language ("we decided / going with / locked in / approved / we will"). Tentative = directional ("let's try / I suggest / we should / thinking of").

CONFIDENCE: 90-100 explicit declaration | 70-89 strong signal | 50-69 moderate | 30-49 weak.

DECIDED_AT: ts of the message that STATES the outcome — not the first reaction to it.

THREAD_KEY: lowercase a-z 0-9 underscore, max 64 chars. Same topic = same thread_key.

DEDUPLICATION — critical:
One resolved topic = ONE decision object.
  1. The message that first states the full outcome is the decision (primary evidence).
  2. Every later message that confirms, restates, or reacts to the same topic → append to evidence_hashes of the primary, NOT a new decision.
  3. If two messages describe the same outcome, produce ONE object with both ids in evidence_hashes.

Example:
  m005: "Anika demos, Rohan handles Q&A" → decision, primary
  m006: "all agreed. Anika demos, Rohan handles technical Q&A" → evidence only, add to m005's evidence_hashes
  m007: "👍" → evidence only, add to m005's evidence_hashes
  Correct output: ONE decision, evidence_hashes: ["m005","m006","m007"]

━━━ RESPONSIBILITIES ━━━

Extract only concrete action items with a clear owner or deadline. Skip vague plans, questions, and anything already completed.

OWNER: exact sender name if self-committing ("I will / I'll / let me / I can"); name of person addressed if delegated ("can you / please + action / you need to"). "unassigned" only if truly no person identifiable.

DUE: convert relative dates ("by Friday", "next Monday", "tomorrow") to YYYY-MM-DD relative to the message ts. Empty string if no deadline.

EVIDENCE_HASH: single id of the message most directly stating the task.

━━━

No results? Return exactly: {"decisions":[],"responsibilities":[]}`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

export type PromptBuild = {
  systemPrompt: string;
  userContent: string;
  idToHash: Record<string, string>;
};

export function buildPrompt(chunk: MessageInput[]): PromptBuild {
  const idToHash: Record<string, string> = {};
  const msgs = chunk.map((m, i) => {
    const id = `m${String(i).padStart(3, "0")}`;
    idToHash[id] = m.message_hash;
    return { id, sender: m.sender, text: m.message_text, ts: m.timestamp };
  });
  return {
    systemPrompt: SYSTEM_PROMPT,
    userContent: JSON.stringify(msgs),
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

  return validateLLMResult(extractJSON(text), idToHash);
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

  return validateLLMResult(extractJSON(text), idToHash);
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

    const { systemPrompt, userContent, idToHash } = buildPrompt(chunks[i]);
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