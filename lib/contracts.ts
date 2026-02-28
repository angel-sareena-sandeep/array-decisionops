// lib/contracts.ts

export type DecisionStatus = "Final" | "Tentative";

export interface DecisionItem {
  id: string;
  title: string;
  version: number;
  status: DecisionStatus;
  confidence: number; // 0-100
  lastUpdated: string;
  explanation: string;
  timestamp: string; // ISO string
  /** Stable slug assigned by LLM to group decisions about the same topic. */
  thread_key?: string;
}

export type ResponsibilityStatus = "Open" | "Overdue" | "Completed";

export interface ResponsibilityItem {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: ResponsibilityStatus;
  description: string;
  timestamp: string; // ISO string
  evidenceCount: number;
}