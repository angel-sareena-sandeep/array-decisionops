/**
 * Trigger definitions for extraction.
 */

// Decision triggers

/** Final decision phrases. */
export const DECISION_FINAL_TRIGGERS: string[] = [
  // Direct
  "final decision",
  "we decided",
  "it's decided",
  "it is decided",
  "we've decided",
  "we have decided",
  "decision made",
  "decision is",
  "decided on",
  "decision:",
  "verdict:",
  "confirmed:",
  "confirmed.",
  "confirmed,",
  "it's confirmed",
  "ok confirmed",
  // Agreement
  "approved",
  "we approved",
  "all agreed",
  "everyone agreed",
  "we all agreed",
  // Locked
  "locked in",
  "lock it in",
  "finalized",
  "finalised",
  "we finalized",
  "we finalised",
  // Settled
  "that's settled",
  "settled then",
  "settled.",
  "we're set",
  "it's a deal",
  "deal.",
  "deal!",
  // Selected
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
  "we're doing",
  // Conclusive
  "that's final",
  "that is final",
  "that's the one",
  "that's the plan",
  "so it's",
  "done, we",
  "ok, decided",
  "ok decided",
  "alright, decided",
  // Deadlines
  "submit by",
  "submit on",
  "submission by",
  "deadline is",
  "deadline set",
  "internal deadline",
  // Emoji
  "✅",
];

/** Tentative decision phrases. */
export const DECISION_TENTATIVE_TRIGGERS: string[] = [
  // Direction
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
  "we should do",
  "we should use",
  // Preference
  "i'd go with",
  "i'd say",
  "i'd suggest",
  "my vote is",
  "i vote for",
  // Direction
  "we go for",
  "let's go for",
  "going for",
  "thinking we",
  "thinking of going",
  // Keep/stick
  "let's keep",
  "we'll keep",
  "sticking with",
  "let's stick with",
  // Pick/choose
  "let's pick",
  "we pick",
  "let's choose",
  "we choose",
  // Planning
  "plan to",
  "we plan to",
  "planning to",
  "we're planning",
  // Soft agreement
  "sounds like a plan",
  "sounds good, let's",
  "agreed on",
  "we agreed on",
  "makes sense to go",
  // Action
  "let's do",
  "let's use",
  "going with",
  "we go with",
  "we'll go ahead",
  "we will go ahead",
  "ideally we",
  "moving forward with",
  "we move forward with",
  // Imperative
  "we need to handle",
  "we need to support",
  "we need to fix",
  "we need to add",
  "we need to do",
  "we need to make",
  "we must handle",
  "we must support",
  "we have to handle",
  "we gotta",
  "needs to happen",
  "has to happen",
  "must happen",
  // Time-based
  "complete by",
  "done by",
  "finish by",
  "ready by",
  "stable by",
  // Deferral
  "optional for now",
  "not for now",
  "skip for now",
  "not needed for now",
  "defer for now",
  "not needed yet",
  // Scope lock
  "no new features",
  "no feature creep",
  "no more features",
  "feature freeze",
];

/** Matches "option x". */
export const OPTION_SELECT_RE = /\boption\s+[a-z]\b/i;

/** Standalone finality words. */
export const DECISION_STANDALONE_RE =
  /^(deal|done|sorted|agreed|confirmed|perfect|sealed|set|settled)[!\s.✓✅]*$/i;

// Responsibility triggers

/** Self-assignment phrases. */
export const RESP_SELF_RE =
  /\b(i will|i'll|i'm going to|i am going to|i can do|i'll take|let me|i'll do|i'll sort|i got it|i got this|i'll take care|leave it to me)\b/i;

/** Delegation phrases. */
export const RESP_OTHER_RE =
  /\b(can you|you will|need you to|you need to|could you|would you|please ensure|are you able to)\b/i;

/** "please" + action pattern. */
export const RESP_PLEASE_ACTION_RE =
  /\bplease\s+(?:\w+\s+){0,3}(send|complete|finish|review|update|check|fix|write|create|add|remove|submit|make|do|handle|take|get|set|ensure|confirm|prepare|share|upload|schedule|book|arrange|contact|follow|coordinate|test|deploy|build|run|implement|draft|collect|gather)\b/i;

/** General task phrases. */
export const RESP_GENERAL_TRIGGER_PHRASES: string[] = [
  // Delegation
  "handle this",
  "take care of",
  // Commitment
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
  // Informal
  "i got it",
  "i got this",
  "leave it to me",
  "no worries, i'll",
  "sure thing, i'll",
  // Ownership
  "i'll manage",
  "i'll take it",
  "i'll be handling",
  "you're responsible",
  "follow up with",
  "responsible for",
  "assigned to",
  "action item",
  "your task",
  "your action",
  // Acknowledgement
  "noted, i will",
  "noted, will",
  "sure, i'll",
  "sure, i will",
  "ok i will",
  "ok i'll",
  "alright i will",
  "alright i'll",
  // Needs doing
  "needs to be done",
  "has to be done",
  "needs to be submitted",
  // Deadline words
  "need to be done by",
  "must be done by",
  "due on",
  "due by",
];

/** "deadline" with action word. */
export const RESP_DEADLINE_RE = /\bdeadline\b/i;
export const RESP_DEADLINE_ACTION_RE =
  /\b(by|before|until|submit|send|complete|finish|deliver)\b/i;

/** Date reference pattern. */
export const RESP_DATE_RE =
  /\b(by|before|until|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next\s+week|end\s+of\s+(day|week|month)|eod|eow|\d{1,2}[\/\-]\d{1,2}|\d{1,2}(?:st|nd|rd|th))\b/i;

/** Action words for date pattern. */
export const RESP_DATE_ACTION_RE =
  /\b(send|submit|finish|complete|deliver|prepare|share|upload|book|confirm|review|fix|write|get|do|make|handle|check|call|meet|present)\b/i;

// Decision context patterns

/** "ok so" summary pattern. */
export const DECISION_SUMMARY_RE = /^ok\s+so\s+\S.{10,}/i;

/** Decision emoji at end. */
export const DECISION_EMOJI_RE = /[✅✓☑✔]\s*$/;

/** Date reference for decisions. */
export const DECISION_DATE_RE =
  /\b(by|before|until|on)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i;

/** Action words for decision date. */
export const DECISION_ACTION_RE =
  /\b(submit|launch|deploy|release|ship|lock|freeze|complete|finish|deliver|stable|ready|live|due|deadline)\b/i;

// Agreement patterns

/** Short agreement messages. */
export const AGREEMENT_SHORT_RE =
  /^(ok|okay|alright|agreed|noted|yes|yep|yeah|yea|yup|works|sounds good|makes sense|cool|sure|fair enough|roger|perfect|fine|right|correct|exactly|bet|will do|on it|got it|good|nice|great|absolutely|definitely|for sure|true)[.!,✅👍🤝✔☑\s]*$/i;

/** Agreement emoji only. */
export const AGREEMENT_EMOJI_RE = /^[👍✅🤝✔☑🫡👌💯🙌✓\s]+$/;