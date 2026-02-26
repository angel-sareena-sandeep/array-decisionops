/**
 * triggers.ts
 *
 * Centralised trigger configuration for decision and responsibility extraction.
 *
 * Extend these arrays/regexes to add new trigger patterns without modifying
 * the core extraction logic in decisionEngine.ts.
 *
 * Design constraints:
 * - No DB-driven triggers; all definitions are static config.
 * - All patterns are deterministic; no LLM calls.
 * - RegExp flags are baked in — never change flags without reviewing all callers.
 */

// ─── Decision triggers ─────────────────────────────────────────────────────────

/**
 * Phrases that signal a confirmed, final decision.
 * Matched case-insensitively against the lowercased message text.
 */
export const DECISION_FINAL_TRIGGERS: string[] = [
  "final decision",
  "we decided",
];

/**
 * Phrases that signal a tentative or proposed decision.
 * Matched case-insensitively against the lowercased message text.
 */
export const DECISION_TENTATIVE_TRIGGERS: string[] = [
  "let's go with",
  "we will go with",
  "we're going with",
  "we are going with",
  "the plan is",
];

/**
 * Matches "option <single-letter>" only when a clear selection context exists.
 * Does NOT match standalone "option a/b" presentations without selection intent;
 * extraction callers are responsible for ensuring surrounding context is decision-like.
 *
 * Examples that match:  "we'll go with option b", "option a seems best"
 * Examples that do NOT: "we have two options: option a or option b"
 *   (the latter won't match a decision trigger phrase, so the option regex alone fires —
 *    this is intentional; see detectDecisionStatus in decisionEngine.ts)
 */
export const OPTION_SELECT_RE = /\boption\s+[a-z]\b/i;

// ─── Responsibility triggers ───────────────────────────────────────────────────

/**
 * Matches self-assignment: speaker commits to a task.
 * Tested against the original (non-lowercased) message text.
 * Examples: "I will send the report", "I'll handle this"
 */
export const RESP_SELF_RE = /\b(i will|i'll)\b/i;

/**
 * Matches delegation to another participant.
 * Tested against the lowercased message text.
 * Examples: "can you review this?", "you will need to submit", "I need you to update"
 */
export const RESP_OTHER_RE = /\b(can you|you will|need you to)\b/i;

/**
 * "please" ONLY triggers a responsibility when it is immediately followed
 * (within ≤3 intervening words) by a concrete action verb.
 *
 * This prevents polite conversational uses ("yes please", "please note",
 * "please let me know") from generating spurious responsibilities.
 *
 * Examples that match:
 *   "please send the report by Friday"
 *   "please review and confirm"
 *   "could you please complete this"
 *
 * Examples that do NOT match:
 *   "yes please"
 *   "please note that..."
 *   "please let me know" (let is not in the action list)
 */
export const RESP_PLEASE_ACTION_RE =
  /\bplease\s+(?:\w+\s+){0,3}(send|complete|finish|review|update|check|fix|write|create|add|remove|submit|make|do|handle|take|get|set|ensure|confirm|prepare|share|upload|schedule|book|arrange|contact|follow|coordinate|test|deploy|build|run|implement|draft|collect|gather)\b/i;

/**
 * High-signal standalone task phrases (excluding "please", which is handled by
 * RESP_PLEASE_ACTION_RE above).
 * Matched case-insensitively against the lowercased message text.
 */
export const RESP_GENERAL_TRIGGER_PHRASES: string[] = [
  "handle this",
  "take care of",
];

/**
 * "deadline" ONLY triggers when the message also contains a task-action word,
 * indicating that the deadline is attached to a concrete deliverable rather
 * than a general discussion of timelines.
 */
export const RESP_DEADLINE_RE = /\bdeadline\b/i;
export const RESP_DEADLINE_ACTION_RE =
  /\b(by|before|until|submit|send|complete|finish|deliver)\b/i;
  