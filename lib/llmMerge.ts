/**
 * Merge deterministic and LLM outputs.
 */

import { DecisionItem, ResponsibilityItem } from "./contracts";
import {
  ExtractDecisionsResult,
  ExtractResponsibilitiesResult,
} from "./decisionEngine";
import { LLMDecision, LLMResponsibility } from "./llm";
import { generateHash } from "./hash";

// Title similarity helper

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "that",
  "this",
  "it",
  "its",
  "by",
  "from",
  "as",
  "into",
  "about",
  "than",
  "then",
  "we",
  "our",
  "all",
  "will",
  "has",
  "have",
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

/** Check title similarity threshold. */
function titlesAreDuplicates(a: string, b: string): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size) >= 0.65;
}

// Decision merge

export function mergeDecisions(
  deterministic: ExtractDecisionsResult,
  llm: LLMDecision[],
): ExtractDecisionsResult {
  console.log(
    `merge: deterministic=${deterministic.items.length}, llm=${llm.length}`,
  );
  if (llm.length === 0) return deterministic;

  // Reverse map by evidence hash
  const hashToDetId: Record<string, string> = {};
  for (const [decId, hashes] of Object.entries(
    deterministic.evidenceByDecisionId,
  )) {
    for (const h of hashes) {
      hashToDetId[h] = decId;
    }
  }

  // Working copies
  const itemsById: Record<string, DecisionItem & { thread_key?: string }> = {};
  for (const item of deterministic.items) {
    itemsById[item.id] = { ...item };
  }
  const evidenceById: Record<string, string[]> = {
    ...deterministic.evidenceByDecisionId,
  };

  // Track deterministic items touched by LLM
  const matchedDetIds = new Set<string>();

  for (const llmDec of llm) {
    // Find overlap by evidence hash
    let matchedId: string | null = null;
    for (const h of llmDec.evidence_hashes) {
      if (hashToDetId[h]) {
        matchedId = hashToDetId[h];
        break;
      }
    }

    if (matchedId && itemsById[matchedId]) {
      // Enrich matched item
      matchedDetIds.add(matchedId);
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
      // Add net-new item
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

  console.log(
    `merge: matched=${matchedDetIds.size}, net-new=${Object.keys(itemsById).length - matchedDetIds.size}, dropping ${deterministic.items.length - matchedDetIds.size} unmatched deterministic`,
  );

  // Drop deterministic items not touched by LLM
  for (const item of deterministic.items) {
    if (!matchedDetIds.has(item.id)) {
      delete itemsById[item.id];
      delete evidenceById[item.id];
    }
  }

  console.log(
    `merge: after drop+dedup = ${Object.keys(itemsById).length} decisions`,
  );

  // Dedupe by thread key
  const byThreadKey: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(itemsById)) {
    const key =
      (item as DecisionItem & { thread_key?: string }).thread_key ?? id;
    if (!byThreadKey[key]) byThreadKey[key] = [];
    byThreadKey[key].push(id);
  }
  for (const ids of Object.values(byThreadKey)) {
    if (ids.length <= 1) continue;
    // Keep highest-confidence item
    ids.sort(
      (a, b) => (itemsById[b].confidence ?? 0) - (itemsById[a].confidence ?? 0),
    );
    const winnerId = ids[0];
    const mergedHashes = new Set(evidenceById[winnerId] ?? []);
    for (const loserId of ids.slice(1)) {
      for (const h of evidenceById[loserId] ?? []) mergedHashes.add(h);
      delete itemsById[loserId];
      delete evidenceById[loserId];
    }
    evidenceById[winnerId] = Array.from(mergedHashes);
  }

  // Second-pass dedupe by title similarity
  const allIds = Object.keys(itemsById);
  for (let i = 0; i < allIds.length; i++) {
    const idA = allIds[i];
    if (!itemsById[idA]) continue;
    for (let j = i + 1; j < allIds.length; j++) {
      const idB = allIds[j];
      if (!itemsById[idB]) continue;
      if (!titlesAreDuplicates(itemsById[idA].title, itemsById[idB].title))
        continue;
      // Merge and keep higher-confidence item
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

  // Reverse map by evidence hash
  const hashToRespId: Record<string, string> = {};
  for (const [respId, hashes] of Object.entries(
    deterministic.evidenceByResponsibilityId,
  )) {
    for (const h of hashes) {
      hashToRespId[h] = respId;
    }
  }

  // Working copies
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
      // Enrich matched item
      itemsById[matchedId] = {
        ...itemsById[matchedId],
        title: llmResp.title,
        owner: llmResp.owner,
        due: llmResp.due,
        description: llmResp.description,
      };
    } else {
      // Add net-new item
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

  // Dedupe by owner + normalized title
  const respByKey: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(itemsById)) {
    const key = `${item.owner}|${item.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (!respByKey[key]) respByKey[key] = [];
    respByKey[key].push(id);
  }
  for (const ids of Object.values(respByKey)) {
    if (ids.length <= 1) continue;
    // Prefer item with due date
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
    // Keep winner evidence
    const mergedHashes = new Set(evidenceById[winnerId] ?? []);
    evidenceById[winnerId] = Array.from(mergedHashes);
  }

  return {
    items: Object.values(itemsById),
    evidenceByResponsibilityId: evidenceById,
  };
}