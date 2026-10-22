# AI Determinism Demo — Frontend Architecture Spec (Sections 4 & 5)

> Scope: This document covers the **technical** portions only — **Section 4 (Component
> Architecture)** and **Section 5 (Technical Integration)**. Narrative (1), UX flow (2),
> and visual design system (3) are owned by other roles; this spec references their outputs
> only where they constrain technical decisions. A short prioritized build plan (6) is
> included at the end because implementation sequencing is a technical concern.
>
> **Hard constraint:** the FastAPI backend logic is **not** modified. The only backend
> change permitted is the static-mount wiring in §5.4, which touches routing/serving, not
> business logic.

---

## 4. Component Architecture (React + TypeScript)

### 4.1 Guiding principles

- **Dependency-light.** Every added dependency must earn its place. The target is a small,
  auditable `node_modules` and a build that a non-frontend maintainer can reason about.
- **One source of truth for run state.** All six views are *projections* of the same
  accumulating run state. Views never fetch; they read from a shared model produced by one
  streaming hook. This is what makes "same question, same data" credible — every view is
  literally reading the same array.
- **The stream owns time; views own layout.** The `useRunStream` hook is the only place
  that talks to the network and the only place that mutates run state. Components are pure
  functions of `(runState, uiState)`.
- **Typed at the boundary.** SSE payloads are untrusted strings until parsed and
  narrowed. The event model (§4.3) is the contract; a single parse/validate function is the
  only place `JSON.parse` output crosses into typed territory.

### 4.2 Component tree

```
<App>
├─ <ConfigProvider>                 // fetches /api/config once, provides via context
│   └─ <QuestionsProvider>          // fetches /api/questions once, provides via context
│       └─ <DemoShell>              // top-level layout: header + controls + stage + footer
│           ├─ <AppHeader>          // title, intro/onboarding trigger (owned by §1/§2)
│           ├─ <RunControls>        // Select(question), Select/Stepper(runs), Run/Stop button
│           │                       //   calls useRunStream().start()/stop()
│           ├─ <RunStatusBar>       // Progress, live counts, truth readout, Badge(verdict)
│           ├─ <ViewStage>          // owns active-view (Tabs) + shared RunState projection
│           │   ├─ <ScatterView>        // dots on answer axis vs truth line
│           │   ├─ <DistributionView>   // histogram of answers per agent
│           │   ├─ <ConvergenceView>    // running-average line vs truth
│           │   ├─ <MechanismView>      // per-run A prose vs B SQL (progressive disclosure)
│           │   ├─ <HumanVsAiView>      // 3 columns: hurried human / analyst / AI mirror
│           │   └─ <ScorecardView>      // verdict table + cost-of-being-wrong
│           └─ <AppFooter>          // provider/model attribution from config
│
└─ Cross-cutting leaf components (shared across views):
   ├─ <TruthReference>     // the "exact answer" line/marker, formatted by unit
   ├─ <AnswerValue>        // formats a float by unit ("count"|"currency"|"ratio")
   ├─ <AgentTag>           // A / B label + color token (A=caution, B=trustworthy)
   ├─ <CorrectnessMark>    // color-blind-safe correct/incorrect indicator (shape + color)
   └─ <CodeReveal>         // "show me the code" disclosure wrapping generated SQL
```

**Notes on placement**

- `ConfigProvider` and `QuestionsProvider` are thin React Context providers. They fetch
  once on mount, expose `{data, loading, error}`, and gate `DemoShell` until both resolve
  (or surface an error state owned by §2). Keeping them as providers (not props drilled
  from `App`) means any view can read `unit`/`formula`/model metadata without plumbing.
- `ViewStage` is the only consumer of the full `RunState`. It passes **narrow, per-view
  slices** to each view so re-renders stay localized. Tab switching is pure UI state and
  does not touch the stream.
- `RunControls` and `RunStatusBar` both read from the same `useRunStream` instance, lifted
  into `DemoShell` and passed down (or provided via a small `RunContext`). There is exactly
  **one** stream instance alive at a time.

### 4.3 Typed model of the SSE events

These interfaces mirror the documented JSON shapes **exactly**. `null`-able fields are
modeled as `T | null` (not optional) because the backend emits the keys with `null` values.

```ts
// ---- Domain primitives -------------------------------------------------------

export type Unit = "count" | "currency" | "ratio";
export type AgentId = "A" | "B";

// ---- /api/config -------------------------------------------------------------

export interface AppConfig {
  provider: string;
  model: string;
  agent_a_temperature: number;
  agent_b_temperature: number;
  default_runs: number;
}

// ---- /api/questions ----------------------------------------------------------

export interface Question {
  id: string;              // used as ?question=<id>
  difficulty: string;      // free-form label from backend (e.g. "easy"|"medium"|"hard")
  prompt: string;
  unit: Unit;
  formula: string;         // Excel-style string, surfaced in Human-vs-AI + Mechanism
}

// ---- SSE event payloads (GET /api/stream) ------------------------------------

export interface TruthEvent {
  type: "truth";
  value: number;
  unit: string;            // backend sends a string; validate against Unit at the edge
}

export interface RunEvent {
  type: "run";
  agent: AgentId;
  run_index: number;
  answer: number | null;
  correct: boolean;
  error: string | null;
  sql: string | null;      // present for Agent B (the deterministic query); null for A
  detail: string | null;   // Agent A prose reasoning (and/or extra context)
}

export interface AgentSummary {
  answers: number[];
  n_runs: number;
  n_correct: number;
  n_errors: number;
  distinct_values: number;
  mean: number;
  stdev: number;
  min: number;
  max: number;
}

export interface SummaryEvent {
  type: "summary";
  truth: number;
  A: AgentSummary;
  B: AgentSummary;
  verdict: string;
}

// Discriminated union — `type` is the discriminant.
export type StreamEvent = TruthEvent | RunEvent | SummaryEvent;

// Single validated parse boundary. Returns null on malformed/unknown payloads so the
// hook can count a parse-skip rather than throw and kill the stream.
export function parseStreamEvent(raw: string): StreamEvent | null {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (typeof obj !== "object" || obj === null) return null;
  const t = (obj as { type?: unknown }).type;
  if (t === "truth" || t === "run" || t === "summary") {
    // Shape is trusted-enough here; add field-level guards if the backend is ever
    // untrusted. Keeping this permissive avoids dropping valid events on minor drift.
    return obj as StreamEvent;
  }
  return null;
}
```

### 4.4 Shared run-state shape

The run state is the **accumulator** that all views project from. It is intentionally
denormalized a little (per-agent arrays plus a flat list) so each view reads what it needs
without re-deriving on every event.

```ts
export type RunPhase =
  | "idle"        // nothing started
  | "connecting"  // EventSource opened, no events yet
  | "streaming"   // receiving run events
  | "done"        // summary received, stream closed cleanly
  | "stopped"     // user aborted
  | "error";      // transport/parse-fatal error

export interface AgentRunState {
  runs: RunEvent[];           // in arrival order (also == run_index order from backend)
  answers: (number | null)[]; // parallel to runs, convenience for charts
  nCorrect: number;
  nErrors: number;
  summary: AgentSummary | null; // populated on SummaryEvent
}

export interface RunState {
  phase: RunPhase;
  questionId: string | null;
  requestedRuns: number;      // what the user asked for (for Progress denominator)
  truth: number | null;
  truthUnit: Unit | null;
  A: AgentRunState;
  B: AgentRunState;
  verdict: string | null;
  receivedRuns: number;       // A.runs.length + B.runs.length (Progress numerator basis)
  error: string | null;
  startedAt: number | null;   // epoch ms, for elapsed display / debugging
}

export const emptyAgentRunState = (): AgentRunState => ({
  runs: [], answers: [], nCorrect: 0, nErrors: 0, summary: null,
});

export const initialRunState = (): RunState => ({
  phase: "idle", questionId: null, requestedRuns: 0,
  truth: null, truthUnit: null,
  A: emptyAgentRunState(), B: emptyAgentRunState(),
  verdict: null, receivedRuns: 0, error: null, startedAt: null,
});
```

**Progress semantics.** The user requests `runs=n`; the backend emits `n` runs **per
agent**, so the natural denominator for a single progress bar is `requestedRuns * 2`. The
status bar may instead show two bars (A, B) each `/ requestedRuns`. Decide with §2; the
state above supports both (`receivedRuns` for a combined bar, per-agent `runs.length` for
split bars).

### 4.5 `useRunStream` hook design

**Responsibilities**

1. Open exactly one `EventSource` per run; guarantee the previous one is closed first.
2. Parse each message via `parseStreamEvent` and fold it into `RunState` through a reducer.
3. Expose imperative `start(args)` / `stop()` plus the current `RunState`.
4. Clean up on unmount and on dependency change (StrictMode-double-invoke safe).

**Why `EventSource` (native) over `fetch`+`ReadableStream`.** The backend sends
`text/event-stream`; `EventSource` is the purpose-built, dependency-free client with
built-in event framing and reconnection semantics. It fits the "dependency-light" mandate.
The one real limitation — `EventSource` is **GET-only and cannot set headers** — is a
non-issue here because the endpoint is `GET /api/stream?question=&runs=` with no auth
header requirement. If auth headers ever become required, switch to
`@microsoft/fetch-event-source` (small, well-maintained) rather than hand-rolling SSE
framing. Call this out as a **risk/assumption** (see §5.6).

**Signature**

```ts
export interface StartRunArgs {
  questionId: string;
  runs: number;
}

export interface UseRunStream {
  state: RunState;
  isActive: boolean;              // phase is "connecting" | "streaming"
  start: (args: StartRunArgs) => void;
  stop: () => void;
  reset: () => void;              // back to initialRunState (clears the stage)
}

export function useRunStream(apiBase?: string): UseRunStream;
// apiBase defaults to "" (same-origin). In dev, the Vite proxy (§5.5) makes "" work too,
// so apiBase is only needed if the frontend is ever hosted off-origin from the API.
```

**Reducer (fold logic)**

```ts
type RunAction =
  | { kind: "start"; questionId: string; requestedRuns: number }
  | { kind: "open" }                       // EventSource onopen
  | { kind: "event"; ev: StreamEvent }
  | { kind: "stopped" }
  | { kind: "error"; message: string }
  | { kind: "reset" };

function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.kind) {
    case "reset":
      return initialRunState();

    case "start":
      return {
        ...initialRunState(),
        phase: "connecting",
        questionId: action.questionId,
        requestedRuns: action.requestedRuns,
        startedAt: Date.now(),
      };

    case "open":
      return state.phase === "connecting" ? { ...state, phase: "streaming" } : state;

    case "event": {
      const ev = action.ev;
      if (ev.type === "truth") {
        const unit = isUnit(ev.unit) ? ev.unit : null;
        return { ...state, truth: ev.value, truthUnit: unit, phase: "streaming" };
      }
      if (ev.type === "run") {
        const key = ev.agent;                 // "A" | "B"
        const prev = state[key];
        const next: AgentRunState = {
          runs: [...prev.runs, ev],
          answers: [...prev.answers, ev.answer],
          nCorrect: prev.nCorrect + (ev.correct ? 1 : 0),
          nErrors: prev.nErrors + (ev.error ? 1 : 0),
          summary: prev.summary,
        };
        return {
          ...state,
          [key]: next,
          receivedRuns: state.receivedRuns + 1,
          phase: "streaming",
        };
      }
      // summary
      return {
        ...state,
        truth: ev.truth,
        A: { ...state.A, summary: ev.A },
        B: { ...state.B, summary: ev.B },
        verdict: ev.verdict,
        phase: "done",
      };
    }

    case "stopped":
      return state.phase === "done" ? state : { ...state, phase: "stopped" };

    case "error":
      return { ...state, phase: "error", error: action.message };
  }
}

function isUnit(u: string): u is Unit {
  return u === "count" || u === "currency" || u === "ratio";
}
```

**Lifecycle / cleanup (the part that bites people)**

```ts
export function useRunStream(apiBase = ""): UseRunStream {
  const [state, dispatch] = useReducer(runReducer, undefined, initialRunState);
  const esRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const start = useCallback((args: StartRunArgs) => {
    closeStream();                                   // never leak a prior stream
    dispatch({ kind: "start", questionId: args.questionId, requestedRuns: args.runs });

    const url = `${apiBase}/api/stream?question=${encodeURIComponent(args.questionId)}` +
                `&runs=${encodeURIComponent(String(args.runs))}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => dispatch({ kind: "open" });
    es.onmessage = (e) => {
      const ev = parseStreamEvent(e.data);
      if (ev) {
        dispatch({ kind: "event", ev });
        if (ev.type === "summary") closeStream();     // clean end: server done, close client
      }
      // else: silently skip malformed line (optionally count it for diagnostics)
    };
    es.onerror = () => {
      // EventSource fires onerror on normal server close too. If we already have a
      // summary ("done"), treat as clean. Otherwise surface as error and stop retrying.
      closeStream();
      dispatch({ kind: "error", message: "Stream connection ended unexpectedly." });
    };
  }, [apiBase, closeStream]);

  const stop = useCallback(() => {
    closeStream();
    dispatch({ kind: "stopped" });
  }, [closeStream]);

  const reset = useCallback(() => {
    closeStream();
    dispatch({ kind: "reset" });
  }, [closeStream]);

  useEffect(() => () => closeStream(), [closeStream]); // unmount cleanup

  const isActive = state.phase === "connecting" || state.phase === "streaming";
  return { state, isActive, start, stop, reset };
}
```

**Important edge cases to encode (and test)**

- **Normal completion vs error.** `EventSource.onerror` fires *both* on real failures and
  on the server closing the stream after the final event. Guard: if `phase === "done"`
  when `onerror` fires, do **not** downgrade to `error`. The snippet above calls
  `closeStream()` inside the `summary` branch so the error handler won't typically fire
  after a clean finish, but keep the guard defensively.
- **Auto-reconnect suppression.** `EventSource` auto-reconnects on drop. For a *finite*
  run we do **not** want that — calling `es.close()` on summary/error prevents the browser
  from re-opening and replaying. This is the single most important bug to avoid.
- **React 19 StrictMode double-invoke.** `start()` is imperative (user-triggered), not an
  effect, so StrictMode's dev-only double-mount (unchanged in behavior from React 18) won't
  double-start. The unmount effect only closes. Verify no stream is opened inside a
  `useEffect` without a guard.
- **Rapid re-runs.** `start()` closes the prior stream first and resets state, so clicking
  Run again mid-stream is safe and deterministic.

### 4.6 Charts: recommendation

**Recommendation: custom lightweight SVG components (no charting library) for Scatter,
Convergence, and the truth reference; a tiny hand-rolled SVG histogram for Distribution.
Do _not_ adopt Recharts.**

**Justification**

- **Dependency weight & mandate.** Recharts pulls in `d3-*` scale/shape packages and is
  substantial relative to this app's needs. The brief explicitly favors a dependency-light,
  no-build-friendly result. Three simple chart types do not justify that footprint.
- **The charts are the emotional core.** The "scatter → converge" moment (§3 animation) is
  bespoke: dots landing scattered for Agent A vs collapsing onto the truth line for Agent B,
  animated as runs stream in. Recharts' animation model fights custom per-point entrance
  choreography; owning the SVG makes the hero animation straightforward (CSS transitions /
  `transform` on `<circle>` + `cx/cy`, or a small `requestAnimationFrame` tween). This is
  easier to get *right* in raw SVG than to coerce from a general charting lib.
- **Data is tiny and 1-D-ish.** Answers are a small array of floats on a single axis
  against one reference value. The math is a linear scale (`domain -> pixel`) — ~15 lines,
  not a library. Distribution is fixed-width bucketing. Convergence is a cumulative mean
  polyline. None of this needs d3's machinery.
- **Accessibility & color-blind safety are easier to control.** Correctness is encoded by
  **shape + position + color** (not color alone) in `<CorrectnessMark>`; owning the SVG
  lets us guarantee redundant encoding and `prefers-reduced-motion` fallbacks precisely.

**What to build (small, shared primitives)**

```ts
// A single linear-scale helper powers every chart. No library needed.
export function linearScale(
  domainMin: number, domainMax: number, rangeMin: number, rangeMax: number,
): (x: number) => number {
  const d = (domainMax - domainMin) || 1; // guard zero-width domain
  const r = rangeMax - rangeMin;
  return (x) => rangeMin + ((x - domainMin) / d) * r;
}
```

- `<AnswerAxis>` — shared axis + `<TruthReference>` marker, consumed by Scatter &
  Convergence so they visually agree.
- `<ScatterView>` — maps `answers[]` to `<circle>`; A on one track, B on another; animate
  `cx` from a jittered start to true position as events arrive.
- `<DistributionView>` — fixed bucket count (e.g. 12), count per bucket → `<rect>` heights.
- `<ConvergenceView>` — cumulative mean polyline per agent vs the truth line.

**Tradeoffs / risks (honest).**
- Custom SVG means **we** own axis ticks, label collision, and responsive viewBox math —
  Recharts gives those free. For three simple charts this is a few dozen lines and worth it;
  for a dashboard with 15 chart types it would not be. Mitigation: keep one `linearScale`
  + one `<AnswerAxis>` shared across views so axis logic lives in exactly one place.
- If scope later explodes (brushing, zoom, many chart types), **revisit**: Recharts or
  `visx` become justified. Document this as the explicit "upgrade trigger."

---

## 5. Technical Integration

### 5.1 Tooling

| Concern            | Choice                                  | Why |
|--------------------|-----------------------------------------|-----|
| Build/dev server   | **Vite**                                | Fast dev, first-class React+TS, trivial static output, built-in dev proxy for `/api`. |
| Framework/language | **React 19 + TypeScript (strict)**      | Required by brief; strict mode catches SSE null-handling bugs at compile time. (Implemented on React 19 / Vite 8 / TypeScript ~6.0; see `frontend/package.json`.) |
| Styling            | **Tailwind CSS**                        | Required; utility classes keep CSS footprint small and projector-legible scaling easy. |
| Components         | **shadcn/ui** (copy-in, Radix-based)    | Required; shadcn is *source you own*, not a runtime dep bundle — aligns with dependency-light goal. Only generate the components actually used (§3): Tabs, Card, Button, Badge, Select, Tooltip, Progress, etc. |
| Charts             | **Custom SVG** (see §4.6)               | Dependency-light; owns the hero animation. |
| State              | **React built-ins** (`useReducer`, Context) | No Redux/Zustand needed; one stream, one reducer. |
| SSE client         | **Native `EventSource`**                | Zero-dependency; matches `text/event-stream`. |

**Explicitly rejected:** Next.js (SSR/routing unneeded; FastAPI already serves static —
adding a Node server is scope creep), Redux/Zustand (state is small and local), Recharts/
d3 (see §4.6), a component library beyond shadcn (shadcn covers it).

### 5.2 Repository layout

Add a sibling `frontend/` Vite project; leave the existing `web/` in place until cutover.

```
repo-root/
├─ app/ (or wherever) ...          # FastAPI app — logic UNCHANGED
│   └─ main.py                     # only the static mount changes (§5.4)
├─ web/                            # legacy vanilla-JS UI (kept until cutover, then retire)
├─ frontend/                       # NEW Vite + React + TS project
│   ├─ index.html
│   ├─ vite.config.ts              # dev proxy for /api (§5.5), build.outDir (§5.3)
│   ├─ tsconfig.json               # "strict": true
│   ├─ tailwind.config.ts
│   ├─ postcss.config.js
│   ├─ package.json
│   ├─ components.json             # shadcn/ui config
│   └─ src/
│       ├─ main.tsx                # React root (StrictMode)
│       ├─ App.tsx                 # DemoShell: header, controls, status, view stage, footer
│       ├─ index.css               # Tailwind entry + design tokens (dark-first, CVD-safe)
│       ├─ hooks/
│       │   └─ useRunStream.ts     # opens the SSE stream; folds events into RunState (reducer)
│       ├─ lib/
│       │   ├─ api.ts              # /api/config & /api/questions fetchers, apiBase
│       │   ├─ types.ts            # SSE event model, RunState, parseStreamEvent (typed boundary)
│       │   ├─ scale.ts            # linearScale helper powering every SVG chart
│       │   └─ utils.ts            # cn() + small shared helpers
│       └─ components/
│           ├─ ui/                 # shadcn-style components, owned source (button, badge, card,
│           │                      #   progress, select, tabs)
│           └─ views/              # Scatter/Convergence/Distribution/Mechanism/HumanVsAi/Scorecard
└─ frontend-dist/                  # BUILD OUTPUT consumed by FastAPI (§5.3) — gitignore'd
```

> **Implementation note.** The grouping above reflects the shipped code. It consolidates the
> originally-proposed `api/`, `stream/`, `state/`, and `charts/` directories into `lib/`
> (fetchers, SSE types + `RunState`, the `linearScale` chart helper) and `hooks/`
> (`useRunStream`). The responsibilities are unchanged — the typed SSE boundary, single
> streaming hook, and shared scale helper all exist as specified — only the file grouping is
> flatter. Chart primitives live inline in the views alongside the shared `lib/scale.ts`.

### 5.3 Build output

Point Vite's build at a stable directory the backend can mount. Two viable patterns:

- **Preferred:** build into a top-level `frontend-dist/` (outside `frontend/src`) and mount
  that from FastAPI. Keeps source and artifact cleanly separated; easy to `.gitignore`.

```ts
// frontend/vite.config.ts  (build portion)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/",                                   // assets referenced from site root
  build: {
    outDir: path.resolve(__dirname, "../frontend-dist"),
    emptyOutDir: true,
  },
  // server.proxy is in §5.5
});
```

- Vite emits hashed assets under `frontend-dist/assets/*` and an `index.html` that
  references them. Because the SPA is a single page, **no client router is needed** (tabs
  are in-page state), so `base: "/"` and a single `index.html` are sufficient — no history
  fallback gymnastics required.

### 5.4 Minimal FastAPI static-mount change (the only backend edit)

The app currently serves `web/` at `/` and `/static`. The minimal change swaps the served
directory to the Vite build output. **No API routes, no handlers, no business logic
change.** Keep `/api/*` routes registered **before** the catch-all static mount so the SPA
mount never shadows the API.

```python
# main.py  — illustrative; adapt names to the existing app.
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# ... existing app = FastAPI(), existing /api/* routers registered ABOVE this line ...

DIST = Path(__file__).resolve().parent.parent / "frontend-dist"  # adjust depth to layout

# Serve hashed assets explicitly (optional but tidy), then SPA fallback at root.
# html=True makes StaticFiles serve index.html for "/" and unknown paths (SPA-friendly).
app.mount("/", StaticFiles(directory=str(DIST), html=True), name="spa")
```

**Rules that keep this safe and minimal:**

- The `/api/*` routers **must** be registered before `app.mount("/", ...)`. FastAPI matches
  in registration order; a root mount registered last will not shadow earlier `/api` routes.
- `html=True` gives SPA fallback (serves `index.html` for `/` and unknown non-asset paths).
  Since there's no client-side routing, this mostly matters for a bare `/` hit — but it's
  the standard, lowest-surprise setting.
- During migration you can keep `web/` mounted at an alternate path (e.g. `/legacy`) and
  mount `frontend-dist` at `/`. After cutover, delete the `web/` mount and directory.
- **Do not** touch SSE response headers, streaming logic, or any handler. The stream works
  same-origin once the SPA is served from the same FastAPI app — no CORS needed in prod.

### 5.5 Vite dev proxy for `/api`

In development the Vite dev server (e.g. `:5173`) must forward `/api` (including the SSE
endpoint) to FastAPI (e.g. `:8000`) so `apiBase=""` works identically in dev and prod.

```ts
// frontend/vite.config.ts  (server portion — merge with build config above)
server: {
  port: 5173,
  proxy: {
    "/api": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      // SSE: do NOT buffer. Vite's http-proxy streams by default; ensure no
      // compression/buffering middleware sits in front. If events arrive batched,
      // confirm the backend sets no buffering and that any reverse proxy is bypassed in dev.
    },
  },
},
```

- **SSE through the proxy:** Vite's dev proxy (node `http-proxy`) streams responses, so
  `text/event-stream` passes through live. The common failure is a buffering layer; in dev
  there shouldn't be one. If events appear batched, that's an environment proxy, not the
  app — note as a risk (§5.6).
- Because both dev and prod resolve the API at same-origin `/api`, the `apiBase` arg to
  `useRunStream` stays `""` everywhere; no `.env` origin switching needed.

### 5.6 Risks, assumptions, tradeoffs

| # | Risk / assumption | Impact | Mitigation |
|---|-------------------|--------|------------|
| R1 | `EventSource` is GET-only and can't send headers. | If `/api/stream` ever needs an auth header, native `EventSource` breaks. | Currently GET + query params + same-origin → fine. If auth lands, swap to `@microsoft/fetch-event-source` (small) behind the same `useRunStream` interface. The hook's public API hides this. |
| R2 | `onerror` fires on clean server close too. | Could show a false "connection ended" error at the end of a run. | Close the client on `summary`; guard `onerror` against `phase === "done"` (§4.5). Add a test that simulates close-after-summary. |
| R3 | `EventSource` auto-reconnects. | A finished finite run could silently re-open and replay. | Always `es.close()` on summary/error. Treated as the #1 bug to prevent; covered by the lifecycle snippet. |
| R4 | SSE buffering in a dev/prod proxy. | Events arrive batched → animation looks "all at once," killing the pedagogy. | Dev: Vite proxy streams by default. Prod: served same-origin by FastAPI (no extra proxy). If a reverse proxy is later added, set it to not buffer `text/event-stream`. |
| R5 | Static mount ordering. | A root mount registered before `/api` would shadow the API. | Register `/api/*` routers first, mount SPA last (§5.4). Add a smoke test hitting `/api/config` after serving the SPA. |
| R6 | `unit` on the truth event is typed `str` by the backend. | A value outside the `Unit` union would mis-format displays. | Validate with `isUnit()` at the reducer edge; fall back to a neutral number format if unknown. |
| R7 | Custom SVG charts own axis/label logic. | More code than a chart lib for edge cases (tick collision, tiny domains). | One shared `linearScale` + `<AnswerAxis>`; documented upgrade trigger to `visx`/Recharts if chart scope grows. |
| R8 | Progress denominator ambiguity (per-agent vs combined runs). | A naive `/n` bar fills to 50% and stalls. | `RunState` tracks both `receivedRuns` and per-agent lengths; pick with §2 and test with a known `runs=n`. |
| R9 | Legacy `web/` and new build coexist during migration. | Confusion over which UI is live. | Mount legacy at `/legacy` temporarily; cut over by changing one mount line; retire `web/` after sign-off. |

---

## 6. Prioritized build plan (phases)

Each phase is independently verifiable; later phases depend on earlier ones.

**Phase 0 — Scaffolding & integration proof (de-risks §5 first).**
- Create `frontend/` Vite + React + TS (strict) + Tailwind + shadcn/ui init.
- Add `vite.config.ts` build `outDir: ../frontend-dist` and the `/api` dev proxy.
- Make the one-line FastAPI static-mount change; verify `/api/config` still responds AND
  the built SPA serves at `/`. **Exit test:** build → load `/` → network tab shows SPA +
  a live `/api/config` 200. This proves §5.4/§5.5 before any UI effort.

**Phase 1 — Data layer & stream core (the technical heart, §4.3–4.5).**
- Implement event model + `parseStreamEvent`, `RunState` + reducer, and `useRunStream`.
- Build `ConfigProvider`/`QuestionsProvider`.
- **Exit test:** a throwaway debug panel runs a question, logs folded `RunState`, and shows
  correct `phase` transitions incl. clean completion (no false error — validates R2/R3).

**Phase 2 — Shell, controls, status (wires state to UI).**
- `DemoShell`, `RunControls` (question/runs selects + Run/Stop), `RunStatusBar`
  (Progress, counts, truth, verdict Badge). Shared leaves: `AnswerValue`, `AgentTag`,
  `CorrectnessMark`, `TruthReference`.
- **Exit test:** full run start→stream→done end-to-end with live counts and verdict.

**Phase 3 — The hero views (Scatter + Convergence) and shared SVG primitives (§4.6).**
- `linearScale`, `<AnswerAxis>`, `<ScatterView>`, `<ConvergenceView>` with the
  scatter→converge animation and `prefers-reduced-motion` fallback.
- **Exit test:** dots stream in and visibly scatter (A) vs collapse to truth (B); reduced
  motion shows final state without animation.

**Phase 4 — Remaining views.**
- `<DistributionView>` (SVG histogram), `<MechanismView>` (A prose vs B SQL via
  `<CodeReveal>` progressive disclosure), `<HumanVsAiView>` (3 columns incl. Excel
  `formula`), `<ScorecardView>` (verdict table + cost-of-being-wrong).

**Phase 5 — Polish, a11y, projector mode, cutover.**
- Color-blind-safe tokens verified (shape+color redundancy), dark theme, responsive/large-
  display scaling. Remove debug panel. Retire `web/` mount and directory.
- **Exit test:** a11y pass (keyboard, contrast, reduced motion), projector layout check,
  and `/legacy` removed with `/` serving the new SPA.

> Note: Phases 3–5 depend on the Section 1/2/3 outputs (narrative ordering, microcopy,
> color tokens, animation feel). This technical plan assumes those are delivered in parallel
> and consumed at Phase 3+. The data/stream/integration spine (Phases 0–2) can proceed
> immediately with no dependency on the non-technical design work.
