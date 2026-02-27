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
  // Direct declaration
  "final decision",
  "we decided",
  "it's decided",
  "it is decided",
  "we've decided",
  "we have decided",
  "decision made",
  "decision is",
  "confirmed:",
  "confirmed.",
  // Agreement & approval
  "approved",
  "we approved",
  "all agreed",
  "everyone agreed",
  "we all agreed",
  // Selection locked in
  "go ahead with",
  "going ahead with",
  "we chose",
  "we have chosen",
  "we selected",
  "we settled on",
  "we'll use",
  "we will use",
  "we're using",
  "we are using",
  // Conclusive
  "that's final",
  "that is final",
  "so it's",
  "done, we",
  "ok, decided",
  "ok decided",
  "alright, decided",
];

/**
 * Phrases that signal a tentative or proposed decision.
 * Matched case-insensitively against the lowercased message text.
 */
export const DECISION_TENTATIVE_TRIGGERS: string[] = [
  // Direction setting
  "let's go with",
  "lets go with",
  "we will go with",
  "we're going with",
  "we are going with",
  "the plan is",
  "our plan is",
  "the plan will be",
  // Proposals
  "i suggest",
  "i propose",
  "proposal:",
  "proposed:",
  "i think we should",
  "i think we go",
  "we should go with",
  "we could go with",
  "maybe we go with",
  // Soft agreement
  "sounds like a plan",
  "sounds good, let's",
  "agreed on",
  "we agreed on",
  "makes sense to go",
  // Action direction
  "let's do",
  "let's use",
  "going with",
  "we go with",
  "we'll go ahead",
  "we will go ahead",
  "ideally we",
  "moving forward with",
  "we move forward with",
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
 * Examples: "I will send the report", "I'll handle this", "I'm going to sort this"
 */
export const RESP_SELF_RE = /\b(i will|i'll|i'm going to|i am going to|i can do|i'll take)\b/i;

/**
 * Matches delegation to another participant.
 * Tested against the lowercased message text.
 * Examples: "can you review this?", "you will need to submit", "I need you to update"
 */
export const RESP_OTHER_RE =
  /\b(can you|you will|need you to|you need to|could you|would you|please ensure|are you able to)\b/i;

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
  // Classic delegation
  "handle this",
  "take care of",
  // Self + other commitment phrases
  "will do",
  "on it",
  "i'm on it",
  "im on it",
  "i am on it",
  "i will handle",
  "i will send",
  "i will update",
  "i will check",
  "i will prepare",
  "i will follow up",
  "i will review",
  "i will confirm",
  "i will share",
  "i will coordinate",
  "i will sort",
  "i will get",
  "i will make",
  // Ownership & assignment
  "follow up with",
  "responsible for",
  "assigned to",
  "action item",
  "your task",
  "your action",
  // Task acknowledgement
  "noted, i will",
  "noted, will",
  "sure, i'll",
  "sure, i will",
  "ok i will",
  "ok i'll",
  "alright i will",
  "alright i'll",
  // Due + deadline variants
  "need to be done by",
  "must be done by",
  "due on",
  "due by",
];

/**
 * "deadline" ONLY triggers when the message also contains a task-action word,
 * indicating that the deadline is attached to a concrete deliverable rather
 * than a general discussion of timelines.
 */
export const RESP_DEADLINE_RE = /\bdeadline\b/i;
export const RESP_DEADLINE_ACTION_RE =
  /\b(by|before|until|submit|send|complete|finish|deliver)\b/i;