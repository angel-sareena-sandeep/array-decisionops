# ARRAY – System Architecture

## Overview

ARRAY is a server-side processing pipeline that transforms unstructured chat exports into structured, version-aware decision records. The architecture is deterministic at its core; LLM enrichment is an optional, manually-triggered layer.

---

## System Flow

```
WhatsApp .txt Export
        │
        ▼
[1] Parse
    lib/parser.ts
    – Tokenise raw export lines into structured message objects
    – Extract: sender, timestamp, body
        │
        ▼
[2] Hash
    lib/hash.ts
    – Generate SHA-256 fingerprint per message (body + timestamp + sender)
    – Fingerprints are the idempotency key for all downstream writes
        │
        ▼
[3] Persist (Idempotent)
    lib/sync.ts → Supabase Postgres
    – Insert messages; skip any whose hash already exists in the database
    – Update decision records where content has changed (version bump)
        │
        ▼
[4] Extract
    lib/decisionEngine.ts
    – Deterministic rule-based scan of persisted messages
    – Identifies: decisions, responsibilities, owners, deadlines
    – No LLM required at this stage
        │
        ▼
[5] Version Detection
    lib/contracts.ts
    – Compare incoming extracted decision against stored version
    – If change detected: preserve prior version, create v(n+1) record
    – Expose latest_version flag for UI rendering
        │
        ▼
[6] Dashboard
    app/(main)/decisions/page.tsx
    app/(main)/responsibilities/page.tsx
    – Read structured records from Supabase
    – Render version history, evidence links, confidence scores
```

---

## Incremental Sync

Re-importing the same WhatsApp export (or an updated version) is safe and non-destructive.

**How it works:**

1. Every message is hashed before any database write.
2. On import, each hash is checked against the `messages` table.
3. Messages whose hash already exists are skipped entirely.
4. New messages (hash not found) are inserted.
5. If a new message causes an existing decision to change, the decision engine creates a new version record rather than overwriting the prior one.

This means:
- Duplicate imports produce no side effects.
- Partial re-imports (e.g. user appended new messages and re-exported) are handled correctly.
- Historical decision records are never mutated.

---

## Idempotency

Idempotency is enforced at two levels:

| Level | Mechanism |
|---|---|
| Message ingestion | SHA-256 hash uniqueness constraint on `messages` table |
| Decision persistence | Version branching on change detection; latest_version flag updated, prior record retained |

No operation in the pipeline is destructive by default.

---

## Why Deterministic Extraction

The extraction engine (`lib/decisionEngine.ts`) uses pattern-based rules rather than LLM inference for core decision identification. This yields:

- **Reproducibility** – same input always produces same output
- **Auditability** – every extracted record traces back to exact source messages
- **Speed** – no inference latency on ingestion
- **Stability** – no prompt drift or model version sensitivity

LLM involvement is limited to optional post-extraction enrichment (normalisation of titles, confidence scoring). It does not participate in ingestion or extraction.

---

## Optional LLM Enrichment Layer

File: `lib/llm.ts`, `lib/llmMerge.ts`

Enrichment is a secondary, manually-triggered pass. It does not run automatically on import.

**What it does:**
- Normalises decision titles into clean, canonical phrasing
- Assigns a confidence score to ambiguous decisions
- Merges near-duplicate decisions identified across message windows

**What it does not do:**
- Hallucinate decisions that are not present in source messages
- Replace deterministic extraction
- Run in the critical path of ingestion

---

## Database

Provider: Supabase Postgres

Key tables:

| Table | Purpose |
|---|---|
| `messages` | Parsed, hashed message records |
| `decisions` | Extracted decision records with version history |
| `responsibilities` | Extracted responsibility assignments |

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/import/whatsapp` | POST | Ingest and parse WhatsApp export |
| `/api/decisions` | GET | Fetch structured decision records |
| `/api/responsibilities` | GET | Fetch responsibility records |
| `/api/enrich` | POST | Trigger optional LLM enrichment pass |
| `/api/dashboard/summary` | GET | Aggregate stats for dashboard |
| `/api/chat/clear` | POST | Clear active session context |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, TailwindCSS |
| Backend | Next.js API Routes |
| Database | Supabase Postgres |
| Hashing | Node.js `crypto` (SHA-256) |
| LLM (optional) | Configurable via `lib/llm.ts` |

---

## Deployment

The system runs fully cloud-side. No local model or hardware dependency is required for the MVP. The architecture is modular and stateless at the API layer, making it compatible with containerised or edge deployments in future phases.
