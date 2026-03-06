/**
 * lib/security.ts
 *
 * Security utilities: rate limiting, input validation, error sanitization.
 * SERVER-ONLY — do NOT import from client components.
 */

// ─── Rate Limiter (sliding window, in-memory) ────────────────────────────────

type RateLimitEntry = {
  timestamps: number[];
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Evict stale entries every 5 minutes to prevent memory leaks. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function cleanupStaleEntries(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of rateLimitStore) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) rateLimitStore.delete(key);
  }
}

/**
 * Check if a request should be rate-limited.
 * Returns { limited: false } if allowed, or { limited: true, retryAfterSec }
 * if the caller has exceeded the limit.
 *
 * @param key    Unique key (e.g. IP + route)
 * @param limit  Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { limited: boolean; retryAfterSec?: number } {
  cleanupStaleEntries(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return { limited: true, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  entry.timestamps.push(now);
  return { limited: false };
}

// ─── Input Validation ─────────────────────────────────────────────────────────

/** UUID v4 pattern (case-insensitive). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a string is a valid UUID v4. */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** SHA-256 hex string pattern (64 lowercase hex chars). */
const SHA256_REGEX = /^[0-9a-f]{64}$/;

/** Validate a string is a valid SHA-256 hex hash. */
export function isValidSHA256(value: string): boolean {
  return SHA256_REGEX.test(value);
}

/** Max allowed lengths for user-provided string fields. */
export const MAX_LENGTHS = {
  chat_name: 200,
  file_name: 255,
  file_sha256: 64,
  /** 50 MB of text content — generous but prevents abuse. */
  content: 50 * 1024 * 1024,
  chat_id: 36,
  status: 20,
  id: 36,
} as const;

/**
 * Validate a string field: not empty, within max length.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateStringField(
  name: string,
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return `'${name}' must be a string.`;
  if (value.trim().length === 0) return `'${name}' must not be empty.`;
  if (value.length > maxLength)
    return `'${name}' exceeds maximum length of ${maxLength}.`;
  return null;
}

// ─── Error Sanitization ──────────────────────────────────────────────────────

/**
 * Sanitize an error message for client consumption.
 * Strips potentially sensitive information (table names, SQL details,
 * stack traces, API keys) and returns a generic message if the original
 * looks like an internal/DB error.
 */
export function sanitizeErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred.",
): string {
  if (!(err instanceof Error)) return fallback;

  const msg = err.message;

  // If it looks like a DB/internal error, don't expose details
  if (
    msg.includes("relation ") ||
    msg.includes("column ") ||
    msg.includes("violates ") ||
    msg.includes("duplicate key") ||
    msg.includes("syntax error") ||
    msg.includes("permission denied") ||
    msg.includes("RLS") ||
    msg.includes("SUPABASE") ||
    msg.includes("apikey") ||
    msg.includes("service_role") ||
    msg.includes("JWT")
  ) {
    return fallback;
  }

  // Truncate overly long messages
  return msg.length > 300 ? msg.slice(0, 300) : msg;
}

// ─── Rate Limit Presets ──────────────────────────────────────────────────────

/** Rate limit presets per endpoint category. */
export const RATE_LIMITS = {
  /** Import: 10 requests per minute per IP. */
  import: { limit: 10, windowMs: 60_000 },
  /** Enrich (LLM-calling): 5 requests per minute per IP. */
  enrich: { limit: 5, windowMs: 60_000 },
  /** Read endpoints: 60 requests per minute per IP. */
  read: { limit: 60, windowMs: 60_000 },
  /** Destructive endpoints (clear): 5 requests per minute per IP. */
  destructive: { limit: 5, windowMs: 60_000 },
  /** Write endpoints (PATCH): 30 requests per minute per IP. */
  write: { limit: 30, windowMs: 60_000 },
} as const;
