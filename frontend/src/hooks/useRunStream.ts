import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseStreamEvent,
  type AgentId,
  type RunEvent,
  type SummaryEvent,
  type Unit,
} from "@/lib/types";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface AgentRunState {
  answers: number[];
  runs: RunEvent[];
  min: number | null;
  max: number | null;
  runningMean: number[]; // one entry per run (carries forward on error runs)
}

export interface RunState {
  status: RunStatus;
  truth: number | null;
  unit: Unit;
  requestedRuns: number;
  completedRuns: number; // counts A+B pairs by max run_index seen
  A: AgentRunState;
  B: AgentRunState;
  summary: SummaryEvent | null;
  error: string | null;
}

function emptyAgent(): AgentRunState {
  return { answers: [], runs: [], min: null, max: null, runningMean: [] };
}

export function initialState(requestedRuns: number): RunState {
  return {
    status: "idle",
    truth: null,
    unit: "number",
    requestedRuns,
    completedRuns: 0,
    A: emptyAgent(),
    B: emptyAgent(),
    summary: null,
    error: null,
  };
}

export function applyRun(agent: AgentRunState, evt: RunEvent): AgentRunState {
  const runs = [...agent.runs, evt];
  let { min, max } = agent;
  const answers = [...agent.answers];
  if (evt.answer != null) {
    answers.push(evt.answer);
    min = min == null ? evt.answer : Math.min(min, evt.answer);
    max = max == null ? evt.answer : Math.max(max, evt.answer);
  }
  const runningMean = [...agent.runningMean];
  if (answers.length > 0) {
    const sum = answers.reduce((p, c) => p + c, 0);
    runningMean.push(sum / answers.length);
  } else {
    runningMean.push(runningMean.length ? runningMean[runningMean.length - 1] : 0);
  }
  return { answers, runs, min, max, runningMean };
}

/**
 * Consume the SSE run stream for a question. Returns the accumulated run state
 * plus `start` / `stop` controls.
 *
 * Lifecycle notes:
 * - EventSource fires `onerror` both on real failures AND when the server
 *   closes the stream normally. We send a sentinel `summary`/`error` event and
 *   then close ourselves, so a post-summary onerror is treated as a clean end.
 * - Browsers auto-reconnect EventSource; we always close() to suppress that.
 * - A new start() tears down any in-flight stream first (rapid re-runs safe).
 */
export function useRunStream(defaultRuns = 20) {
  const [state, setState] = useState<RunState>(() => initialState(defaultRuns));
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const start = useCallback(
    (questionId: string, runs: number) => {
      stop();
      doneRef.current = false;
      setState(initialState(runs));
      setState((s) => ({ ...s, status: "running" }));

      const url = `/api/stream?question=${encodeURIComponent(questionId)}&runs=${runs}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        const evt = parseStreamEvent(e.data);
        if (!evt) return;

        if (evt.type === "truth") {
          setState((s) => ({ ...s, truth: evt.value, unit: evt.unit }));
        } else if (evt.type === "run") {
          setState((s) => {
            const agentKey = evt.agent as AgentId;
            const updated = applyRun(s[agentKey], evt);
            const completedRuns = Math.max(s.completedRuns, evt.run_index + 1);
            return { ...s, [agentKey]: updated, completedRuns };
          });
        } else if (evt.type === "summary") {
          doneRef.current = true;
          setState((s) => ({ ...s, summary: evt, truth: evt.truth, status: "done" }));
          stop();
        } else if (evt.type === "error") {
          doneRef.current = true;
          setState((s) => ({ ...s, error: evt.message, status: "error" }));
          stop();
        }
      };

      es.onerror = () => {
        // If we already finished, this is just the normal close — ignore.
        if (doneRef.current) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: "Connection lost while streaming results.",
        }));
        stop();
      };
    },
    [stop]
  );

  // Clean up on unmount.
  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
