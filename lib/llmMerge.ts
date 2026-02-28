/**
 * lib/llmMerge.ts
 *
 * Pure merge logic — no DB access, no API calls, no side effects.
 *
 * Combines deterministic extraction results with LLM extraction results.
 *
 * Merge strategy:
 * - Match LLM items to deterministic items via evidence hash overlap.
 * - When matched: LLM wins on enrichment fields (title, confidence,
 *   status, explanation, owner, due, description, thread_key).
 * - Deterministic items with no LLM match are kept as-is (LLM missed them).
 * - Net-new LLM items (no deterministic match) are appended.
 */

import { DecisionItem, ResponsibilityItem } from "./contracts";
import {
  ExtractDecisionsResult,
  ExtractResponsibilitiesResult,
} from "./decisionEngine";
import { LLMDecision, LLMResponsibility } from "./llm";
import { generateHash } from "./hash";

// ─── Decisions merge ──────────────────────────────────────────────────────────

export function mergeDecisions(
  deterministic: ExtractDecisionsResult,
  llm: LLMDecision[],
): ExtractDecisionsResult {
  if (llm.length === 0) return deterministic;

  // Build reverse map: msg_sha256 → deterministic decision id
  const hashToDetId: Record<string, string> = {};
  for (const [decId, hashes] of Object.entries(
    deterministic.evidenceByDecisionId,
  )) {
    for (const h of hashes) {
      hashToDetId[h] = decId;
    }
  }

  // Mutable working copies
  const itemsById: Record<string, DecisionItem & { thread_key?: string }> = {};
  for (const item of deterministic.items) {
    itemsById[item.id] = { ...item };
  }
  const evidenceById: Record<string, string[]> = {
    ...deterministic.evidenceByDecisionId,
  };

  for (const llmDec of llm) {
    // Find first overlapping deterministic decision
    let matchedId: string | null = null;
    for (const h of llmDec.evidence_hashes) {
      if (hashToDetId[h]) {
        matchedId = hashToDetId[h];
        break;
      }
    }

    if (matchedId && itemsById[matchedId]) {
      // Enrich the existing deterministic item with LLM quality fields
      itemsById[matchedId] = {
        ...itemsById[matchedId],
        title: llmDec.title,
        status: llmDec.status,
        confidence: llmDec.confidence,
        explanation: llmDec.explanation,
        timestamp: llmDec.decided_at,
        lastUpdated: llmDec.decided_at,
        thread_key: llmDec.thread_key,
      };
    } else {
      // Net-new LLM detection — stable id derived from thread_key
      const newId =
        "dec_" + generateHash("decision|" + llmDec.thread_key).slice(0, 12);
      if (!itemsById[newId]) {
        itemsById[newId] = {
          id: newId,
          title: llmDec.title,
          version: 1,
          status: llmDec.status,
          confidence: llmDec.confidence,
          explanation: llmDec.explanation,
          timestamp: llmDec.decided_at,
          lastUpdated: llmDec.decided_at,
          thread_key: llmDec.thread_key,
        };
        evidenceById[newId] = llmDec.evidence_hashes;
      }
    }
  }

  return {
    items: Object.values(itemsById),
    evidenceByDecisionId: evidenceById,
  };
}

// ─── Responsibilities merge ───────────────────────────────────────────────────

export function mergeResponsibilities(
  deterministic: ExtractResponsibilitiesResult,
  llm: LLMResponsibility[],
): ExtractResponsibilitiesResult {
  if (llm.length === 0) return deterministic;

  // Build reverse map: msg_sha256 → deterministic responsibility id
  const hashToRespId: Record<string, string> = {};
  for (const [respId, hashes] of Object.entries(
    deterministic.evidenceByResponsibilityId,
  )) {
    for (const h of hashes) {
      hashToRespId[h] = respId;
    }
  }

  // Mutable working copies
  const itemsById: Record<string, ResponsibilityItem> = {};
  for (const item of deterministic.items) {
    itemsById[item.id] = { ...item };
  }
  const evidenceById: Record<string, string[]> = {
    ...deterministic.evidenceByResponsibilityId,
  };

  for (const llmResp of llm) {
    const matchedId = hashToRespId[llmResp.evidence_hash] ?? null;

    if (matchedId && itemsById[matchedId]) {
      // Enrich the existing deterministic item with LLM quality fields
      itemsById[matchedId] = {
        ...itemsById[matchedId],
        title: llmResp.title,
        owner: llmResp.owner,
        due: llmResp.due,
        description: llmResp.description,
      };
    } else {
      // Net-new LLM detection — stable id derived from evidence hash
      const newId =
        "resp_" + generateHash("resp|" + llmResp.evidence_hash).slice(0, 12);
      if (!itemsById[newId]) {
        itemsById[newId] = {
          id: newId,
          title: llmResp.title,
          owner: llmResp.owner,
          due: llmResp.due,
          description: llmResp.description,
          status: "Open",
          timestamp: "",
          evidenceCount: 1,
        };
        evidenceById[newId] = [llmResp.evidence_hash];
      }
    }
  }

  return {
    items: Object.values(itemsById),
    evidenceByResponsibilityId: evidenceById,
  };
}