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

// ─── Title similarity helper ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","was","are","were","be","been","that","this","it","its","by","from",
  "as","into","about","than","then","we","our","all","will","has","have",
]);

function significantWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/** Returns true when both titles share ≥65% of the smaller title's significant words. */
function titlesAreDuplicates(a: string, b: string): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size) >= 0.65;
}

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

  // Deduplicate by thread_key: if multiple items share the same thread_key
  // (e.g. original decision + confirmation restatement both extracted), keep
  // the one with the highest confidence and merge their evidence hashes.
  const byThreadKey: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(itemsById)) {
    const key = (item as DecisionItem & { thread_key?: string }).thread_key ?? id;
    if (!byThreadKey[key]) byThreadKey[key] = [];
    byThreadKey[key].push(id);
  }
  for (const ids of Object.values(byThreadKey)) {
    if (ids.length <= 1) continue;
    // Keep the item with highest confidence
    ids.sort((a, b) => (itemsById[b].confidence ?? 0) - (itemsById[a].confidence ?? 0));
    const winnerId = ids[0];
    const mergedHashes = new Set(evidenceById[winnerId] ?? []);
    for (const loserId of ids.slice(1)) {
      for (const h of evidenceById[loserId] ?? []) mergedHashes.add(h);
      delete itemsById[loserId];
      delete evidenceById[loserId];
    }
    evidenceById[winnerId] = Array.from(mergedHashes);
  }

  // Second-pass dedup: title similarity — catches cases where the LLM
  // assigned different thread_keys to the same real-world decision.
  const allIds = Object.keys(itemsById);
  for (let i = 0; i < allIds.length; i++) {
    const idA = allIds[i];
    if (!itemsById[idA]) continue;
    for (let j = i + 1; j < allIds.length; j++) {
      const idB = allIds[j];
      if (!itemsById[idB]) continue;
      if (!titlesAreDuplicates(itemsById[idA].title, itemsById[idB].title)) continue;
      // Merge: keep higher-confidence item
      const [winnerId, loserId] =
        (itemsById[idA].confidence ?? 0) >= (itemsById[idB].confidence ?? 0)
          ? [idA, idB]
          : [idB, idA];
      const merged = new Set(evidenceById[winnerId] ?? []);
      for (const h of evidenceById[loserId] ?? []) merged.add(h);
      evidenceById[winnerId] = Array.from(merged);
      delete itemsById[loserId];
      delete evidenceById[loserId];
    }
  }

  return {
    items: Object.values(itemsById),
    evidenceByDecisionId: evidenceById,
  };
}

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

  // Deduplicate responsibilities by (owner + normalised title): if the LLM
  // extracted the same action from different messages, keep the one with a
  // non-empty due date, or fall back to the first.
  const respByKey: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(itemsById)) {
    const key = `${item.owner}|${item.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (!respByKey[key]) respByKey[key] = [];
    respByKey[key].push(id);
  }
  for (const ids of Object.values(respByKey)) {
    if (ids.length <= 1) continue;
    // Prefer item that has a due date
    ids.sort((a, b) => {
      const aDue = itemsById[a].due ? 1 : 0;
      const bDue = itemsById[b].due ? 1 : 0;
      return bDue - aDue;
    });
    const winnerId = ids[0];
    for (const loserId of ids.slice(1)) {
      delete itemsById[loserId];
      delete evidenceById[loserId];
    }
    // Merge evidence into winner
    const mergedHashes = new Set(evidenceById[winnerId] ?? []);
    evidenceById[winnerId] = Array.from(mergedHashes);
  }

  return {
    items: Object.values(itemsById),
    evidenceByResponsibilityId: evidenceById,
  };
}