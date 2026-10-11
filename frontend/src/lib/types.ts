// Typed model of the backend API + SSE stream.
// These shapes mirror app/server.py and app/harness.py exactly.

export type Unit = "count" | "currency" | "ratio" | "number";
export type AgentId = "A" | "B";

export interface AppConfig {
  provider: string;
  model: string;
  agent_a_temperature: number;
  agent_b_temperature: number;
  default_runs: number;
}

export interface Question {
  id: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  unit: Unit;
  formula: string; // Excel-style formula (human-analyst teaching aid)
}

// ---- SSE events ----
export interface TruthEvent {
  type: "truth";
  value: number;
  unit: Unit;
}

export interface RunEvent {
  type: "run";
  agent: AgentId;
  run_index: number;
  answer: number | null;
  correct: boolean;
  error: string | null;
  sql: string | null; // Agent B only
  detail: string | null; // Agent A reasoning text
}

export interface AgentSummary {
  agent: AgentId;
  answers: number[];
  n_runs: number;
  n_correct: number;
  n_errors: number;
  distinct_values: number;
  mean: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
}

export interface SummaryEvent {
  type: "summary";
  truth: number;
  A: AgentSummary;
  B: AgentSummary;
  verdict: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent =
  | TruthEvent
  | RunEvent
  | SummaryEvent
  | ErrorEvent;

/** Narrow a parsed JSON object to a StreamEvent (defensive). */
export function parseStreamEvent(raw: string): StreamEvent | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.type === "string") return obj as StreamEvent;
  } catch {
    /* ignore malformed frames */
  }
  return null;
}
