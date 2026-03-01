# Decision Record – Atomic Unit

## Definition

A Decision Record is the core data structure in ARRAY. It represents a single verifiable, version-tracked decision extracted from a conversation. Every field is either derived deterministically from source messages or computed from structured metadata. No field is inferred without an evidence reference.

---

## Schema

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Stable unique identifier. Never changes across versions. |
| `title` | string | Canonical statement of the decision. |
| `outcome` | string | Final resolved state of the decision. |
| `confidence` | float (0–1) | Extraction confidence score. Assigned by deterministic rules; optionally refined by LLM enrichment pass. |
| `status` | enum | `open` / `confirmed` / `superseded` / `conflicted` |
| `owner` | string | Participant assigned ownership, extracted from message content. |
| `participants` | string[] | All participants whose messages contributed to this decision. |
| `evidence` | EvidenceRef[] | Array of source message references (see below). |
| `version` | integer | Monotonically incrementing version number. Starts at 1. |
| `latest_version` | boolean | True only for the current valid version of this decision. |
| `previous_versions` | DecisionRecord[] | Ordered history of superseded versions. |
| `created_at` | timestamp | When this version of the record was first persisted. |
| `updated_at` | timestamp | Last modification timestamp. |

---

## Evidence Reference Schema

Each `EvidenceRef` links a decision to one or more source messages.

| Field | Type | Description |
|---|---|---|
| `message_id` | UUID | Foreign key to the `messages` table. |
| `sender` | string | Name or identifier of the message author. |
| `timestamp` | timestamp | Original message timestamp from the chat export. |
| `body_excerpt` | string | Relevant excerpt from the source message body. |
| `hash` | string | SHA-256 hash of the source message. Confirms evidence integrity. |

Evidence references are immutable. When a new version is created, new evidence references are added; prior references are preserved in the version history.

---

## Version Detection

Version updates are detected when the extraction engine identifies a message that modifies a previously extracted decision.

**Detection logic:**

1. A new ingestion pass produces an extracted decision candidate.
2. The engine checks whether a decision with a matching semantic key already exists.
3. If the `outcome` or `title` differs from the latest stored version:
   - The existing record's `latest_version` flag is set to `false`.
   - A new record is created with `version = n + 1` and `latest_version = true`.
   - The prior record is retained in full and linked via `previous_versions`.
4. If no change is detected, the existing record is unchanged.

**Example:**

```
v1 (superseded):
  title: "Submit report by Friday"
  evidence: [msg_id: abc123, ts: 2024-01-10 14:32]

v2 (latest):
  title: "Submit report by Saturday – deadline extended"
  evidence: [msg_id: abc123, ts: 2024-01-10 14:32]
             [msg_id: def456, ts: 2024-01-11 09:15]
```

The UI renders the latest version prominently and exposes version history on demand.

---

## Latest Version Rendering

The dashboard surfaces only records where `latest_version = true` in the default view.

Version history is accessible per-record, ordered by `version` ascending. Superseded versions are rendered with a `superseded` status badge to prevent confusion.

---

## Evidence Traceability and Hallucination Prevention

Every decision surface in the UI is backed by at least one `EvidenceRef`. If a decision candidate cannot be linked to a source message, it is not persisted.

This constraint means:

- No decision exists in the system without a traceable origin in the original chat export.
- LLM enrichment may normalise phrasing but cannot introduce a decision that lacks a source reference.
- Confidence scoring reflects extraction certainty, not model confidence — the two are explicitly separated.

The hash stored on each `EvidenceRef` allows any decision record to be independently verified against the original import at any point in the future.

---

## Status Transitions

```
            ┌──────────┐
   extract  │          │  new version detected
  ─────────▶│  open    │──────────────────────▶  superseded
            │          │
            └────┬─────┘
                 │ confirmed by owner / enrichment pass
                 ▼
            confirmed
```

A `conflicted` status is set when two or more messages produce contradictory decisions within the same context window and the engine cannot determine precedence. These records are flagged for manual review.
