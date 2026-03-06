// lib/contracts.ts

export type DecisionStatus = "Final" | "Tentative";

/** Evidence message. */
export interface EvidenceMessage {
  text: string;
  sender: string;
  timestamp: string; // ISO
}

export interface DecisionItem {
  id: string;
  title: string;
  version: number;
  status: DecisionStatus;
  confidence: number; // 0-100
  lastUpdated: string;
  explanation: string;
  timestamp: string; // ISO
  /** Decision thread key. */
  thread_key?: string;
  /** Evidence messages. */
  evidence?: EvidenceMessage[];
}

export type ResponsibilityStatus = "Open" | "Overdue" | "Completed";

export interface ResponsibilityItem {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: ResponsibilityStatus;
  description: string;
  timestamp: string; // ISO
  evidenceCount: number;
  /** Evidence messages. */
  evidence?: EvidenceMessage[];
}