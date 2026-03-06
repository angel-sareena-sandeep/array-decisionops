/**
 * Security helpers.
 */

// Rate limiter

type RateLimitEntry = {
  timestamps: number[];
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Cleanup interval. */
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
 * Checks if a key is rate-limited.
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

  // Keep timestamps in window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return { limited: true, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  entry.timestamps.push(now);
  return { limited: false };
}

// Input validation

/** UUID pattern. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate UUID. */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** SHA-256 hex pattern. */
const SHA256_REGEX = /^[0-9a-f]{64}$/;

/** Validate SHA-256. */
export function isValidSHA256(value: string): boolean {
  return SHA256_REGEX.test(value);
}

/** Max string lengths. */
export const MAX_LENGTHS = {
  chat_name: 200,
  file_name: 255,
  file_sha256: 64,
  /** Max content size (50 MB). */
  content: 50 * 1024 * 1024,
  chat_id: 36,
  status: 20,
  id: 36,
} as const;

/**
 * Validate required string field.
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

// Error sanitization

/**
 * Return safe error text for clients.
 */
export function sanitizeErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred.",
): string {
  if (!(err instanceof Error)) return fallback;

  const msg = err.message;

  // Hide internal error details
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

  // Truncate long messages
  return msg.length > 300 ? msg.slice(0, 300) : msg;
}

// Rate-limit presets

/** Preset limits. */
export const RATE_LIMITS = {
  /** Import endpoints. */
  import: { limit: 10, windowMs: 60_000 },
  /** Enrich endpoints. */
  enrich: { limit: 5, windowMs: 60_000 },
  /** Read endpoints. */
  read: { limit: 60, windowMs: 60_000 },
  /** Destructive endpoints. */
  destructive: { limit: 5, windowMs: 60_000 },
  /** Write endpoints. */
  write: { limit: 30, windowMs: 60_000 },
} as const;
