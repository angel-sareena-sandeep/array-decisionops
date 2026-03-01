# ARRAY – DecisionOps for High-Noise Collaboration

## What It Is

ARRAY is decision infrastructure for teams that work in high-volume messaging environments. It operates on a specific, unsolved problem: modern collaboration happens inside chat platforms that optimise for conversation, not decision memory. ARRAY ingests raw chat exports, applies a deterministic extraction pipeline, and produces structured, version-aware, evidence-backed decision records — each linked to the exact source messages that produced it. It is not a chatbot, not a summariser, and not a GPT wrapper. It is a persistence and traceability layer for the decisions that would otherwise be buried inside a conversation thread.

---

## The Problem

In chat-based teams, decisions are made inside WhatsApp groups, Slack channels, and similar platforms. These tools are not designed to preserve decision state. The consequences are consistent and predictable:

- Decisions get buried under subsequent messages
- Ownership is assigned verbally but never formally recorded
- Decisions change silently between conversations — no audit trail
- Teams revisit discussions that have already been resolved
- Deadlines drift because no single record captures the current state

This is decision drift. ARRAY solves it.

---

## MVP Scope (Strict Launch Version)

This repository contains the launch version of ARRAY. Scope is fixed and intentionally constrained.

**Included:**

- WhatsApp .txt export ingestion (WhatsApp only)
- Structured message parsing (sender, timestamp, body)
- SHA-256 per-message hashing
- Idempotent incremental re-import (new messages inserted, duplicates skipped)
- Deterministic decision extraction
- Responsibility and ownership extraction
- Version-aware decision detection (v1 → v2 updates with full history)
- Evidence-linked decision records (every decision traces to source message IDs and timestamps)
- Search across decision records
- Dashboard with aggregate stats
- Manual LLM enrichment (optional post-extraction pass, not required for core operation)

**Not included in this version:** Slack, Discord, Telegram, media ingestion, real-time sync, automated inference. See Roadmap.

---

## Product Screenshots

![Upload](screenshots/01-upload.png)
![Decisions](screenshots/02-decisions.png)
![Responsibilities](screenshots/03-responsibilities.png)
![Search](screenshots/04-search.png)
![AI Enrichment](screenshots/05-ai-enrichment.png)

---

## Core Differentiators

### Evidence Traceability

Every decision record in ARRAY contains an explicit list of source message references — message ID, sender, timestamp, and body excerpt. A decision cannot be persisted without at least one verified evidence reference. This eliminates hallucination at the persistence layer and makes every record independently auditable.

### Version Detection

When a re-import introduces a message that updates a prior decision, ARRAY does not overwrite the existing record. It creates a new version, marks the prior as superseded, and surfaces the latest version in the dashboard. The full version history is retained and accessible per record.

Example:
```
v1 – "Submit report by Friday"
v2 – "Submit report by Saturday – deadline extended"  ← current
```

### Hash-Based Incremental Sync

Re-importing the same chat export (or an updated one with new messages appended) is safe.

- Every message is SHA-256 hashed before any write
- Messages whose hash already exists in the database are skipped
- Only net-new messages trigger extraction and persistence
- No destructive operations occur on re-import

This makes ARRAY re-import-safe and operationally stable. Engineering correctness takes precedence over inference convenience.

---

## System Architecture

The processing pipeline is:

```
Upload → Parse → Hash → Persist (idempotent) → Extract → Version Detect → Dashboard
```

Frontend: Next.js 14 (TypeScript), TailwindCSS  
Backend: Next.js API Routes  
Database: Supabase Postgres  
Hashing: SHA-256 via Node.js `crypto`  
Extraction: Deterministic rule-based engine  
LLM: Optional enrichment only (`lib/llm.ts`), not in the critical path

Full architecture documentation: [docs/architecture.md](docs/architecture.md)  
Decision record schema: [docs/decision-record.md](docs/decision-record.md)

---

## How to Run

**Prerequisites:** Node.js 18+, a Supabase project with the required schema applied.

```bash
npm install
npm run dev
```

The application runs at `http://localhost:3000`.

To test ingestion, export a WhatsApp conversation as a `.txt` file and upload it through the import interface. No external connectors, no API keys required for core functionality. LLM enrichment requires a configured provider key in `.env.local`.

---

## Known Limitations

- **WhatsApp only.** This version ingests WhatsApp `.txt` exports exclusively.
- **No real-time sync.** Import is manual and file-based.
- **Manual enrichment.** LLM enrichment is an optional, manually-triggered pass.
- **No media processing.** Images, audio, and documents are not parsed.
- **English-primary.** The extraction engine is optimised for English-language conversations.

---

## Roadmap (Future Phase)

The following are planned for future phases. They do not exist in this codebase.

- Telegram ingestion
- Slack connector
- Discord bot
- Media intelligence (image and audio parsing)
- Modular inference layer for automated extraction
- On-device inference support
- Real-time sync via webhook or connector

---

## AMD Alignment

The MVP runs fully cloud-based on standard infrastructure. The system architecture is modular and stateless at the API layer. The processing pipeline — parsing, hashing, extraction, versioning — is designed to run as discrete, independently deployable units. This makes the system compatible with future deployment on ROCm-compatible infrastructure and AI-enabled edge devices as those deployment targets become relevant. No hardware-specific claims apply to the current version.

---

## License

See [LICENSE](LICENSE).
