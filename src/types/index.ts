// Enums matching SQL CHECK constraints

export type MemoryType =
  | "action"
  | "decision"
  | "observation"
  | "realization"
  | "blocker";

export type Valence = "positive" | "negative" | "neutral" | "mixed";

export type Visibility = "contributed" | "internal";

export type AgentStatus =
  | "active"
  | "suspended"
  | "quarantined"
  | "disabled";

export type ContestationSeverity = "minor" | "significant" | "critical";

export type SessionOutcome =
  | "positive"
  | "negative"
  | "mixed"
  | "neutral"
  | "abandoned";

// Database row interfaces

export interface AgentRow {
  agent_id: string;
  agent_name: string;
  agent_role: string | null;
  current_model: string | null;
  model_updated_at: Date | null;
  status: AgentStatus;
  status_reason: string | null;
  status_changed_at: Date | null;
  status_changed_by: string | null;
  created_at: Date;
}

export interface SessionRow {
  session_id: string;
  agent_id: string;
  started_at: Date;
  ended_at: Date | null;
  summary: string | null;
  outcome_valence: string | null;
}

export interface MemoryRow {
  memory_id: string;
  session_id: string;
  agent_id: string;
  entry: string;
  memory_type: MemoryType;
  model_version: string | null;
  confidence: number;
  valence: Valence;
  salience: number;
  tension: string | null;
  orientation: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
  visibility: Visibility;
  is_quarantined: boolean;
  quarantined_at: Date | null;
  quarantined_by: string | null;
  is_verified: boolean;
  verified_at: Date | null;
  verified_by: string | null;
  created_at: Date;
}

export interface ContestationRow {
  contestation_id: string;
  memory_id: string;
  contesting_agent_id: string;
  is_self_contestation: boolean;
  reason: string;
  confidence: number;
  severity: ContestationSeverity;
  created_at: Date;
}

export interface MemoryAccessRow {
  access_id: number;
  memory_id: string;
  agent_id: string;
  access_type: string;
  accessed_at: Date;
}
