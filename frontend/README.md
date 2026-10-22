# AI Determinism Demo — Frontend

The React UI for the **AI Determinism Demo**. It streams a single run from the
FastAPI backend and renders six synchronized views that let a **non-technical
audience** *feel* why asking an AI to "just read the data and tell me the
answer" is risky, while asking it to "write the formula and let the computer run
it" is trustworthy.

- **Helper A — the Guesser:** the AI does mental math on raw data → answers
  scatter, often wrong.
- **Helper B — the Formula Writer:** the AI writes a query a deterministic
  engine runs → the same correct answer every time.

> This is the React redesign described in the repo root `README.md`
> ("Frontend (React redesign)"). For the product thesis, backend, and providers,
> start there. For the design rationale and technical contract, see the two
> briefs in the repo root:
> [`ai-determinism-demo-design-spec.md`](../ai-determinism-demo-design-spec.md)
> (narrative, UX flow, visual system — Sections 1–3) and
> [`ai-determinism-demo-ARCHITECTURE.md`](../ai-determinism-demo-ARCHITECTURE.md)
> (component architecture, SSE typing, FastAPI integration — Sections 4–6).

---

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | **Vite 8** |
| Framework / language | **React 19 + TypeScript (strict)** |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) |
| Components | **shadcn-style** (owned source under `src/components/ui/`) |
| Charts | **Custom SVG** (no charting library) |
| State | **React built-ins** (`useReducer` + a single streaming hook) |
| SSE client | **Native `EventSource`** |
| Icons | **lucide-react** |
| Lint | **oxlint** |

Deliberately dependency-light: no Redux/Zustand, no Recharts/d3, no component
library beyond the copied-in shadcn primitives. The charts and the hero
"scatter → converge" animation are hand-rolled SVG so the teaching beat is fully
art-directed.

---

## Prerequisites

- **Node.js 20+** (Vite 8 / React 19 toolchain).
- The **FastAPI backend running on `http://127.0.0.1:8000`** for any live run.
  See the repo root `README.md` for backend setup. For a fully offline demo set
  `LLM_PROVIDER=mock` in the backend `.env`.

---

## Install

```powershell
cd frontend
npm install
```

> `frontend/node_modules/` and the build output `frontend-dist/` are gitignored.
> Run `npm install` after cloning.

---

## Develop (hot reload)

Two terminals:

```powershell
# terminal 1 — backend (from repo root)
.\.venv\Scripts\python.exe -m uvicorn app.server:app --port 8000

# terminal 2 — Vite dev server
cd frontend
npm run dev
```

Open the URL Vite prints (default <http://localhost:5173>). The dev server
proxies `/api` (including the SSE stream) to the backend on `:8000`, so the app
talks to the API at the same-origin path `/api` in both dev and production — no
origin/env switching needed.

---

## Build & serve (production)

```powershell
cd frontend
npm run build          # tsc -b && vite build  → emits to ../frontend-dist
cd ..

# FastAPI auto-detects frontend-dist/ and serves the SPA at /
.\.venv\Scripts\python.exe -m uvicorn app.server:app --port 8000
```

Then open <http://127.0.0.1:8000>. When `frontend-dist/` is absent, the backend
falls back to the original vanilla-JS UI in `web/`.

---

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `vite` | Dev server with HMR + `/api` proxy. |
| `npm run build` | `tsc -b && vite build` | Type-check, then build to `../frontend-dist`. |
| `npm run preview` | `vite preview` | Serve the production build locally for a smoke test. |
| `npm run lint` | `oxlint` | Lint the source. |

---

## Project structure

```
frontend/
├─ index.html
├─ vite.config.ts            # build.outDir → ../frontend-dist; dev proxy for /api (SSE-safe)
├─ tsconfig*.json            # strict TypeScript; "@/*" path alias → src/*
├─ package.json
└─ src/
   ├─ main.tsx               # React root (StrictMode)
   ├─ App.tsx                # DemoShell: header, controls, status, view stage, footer
   ├─ index.css              # Tailwind entry + design tokens (dark-first, CVD-safe)
   ├─ hooks/
   │   └─ useRunStream.ts    # the ONLY place that opens the SSE stream & mutates run state
   ├─ lib/
   │   ├─ api.ts             # /api/config & /api/questions fetchers; apiBase
   │   ├─ types.ts           # SSE event model, RunState, parseStreamEvent (typed boundary)
   │   ├─ scale.ts           # linearScale helper powering every SVG chart
   │   └─ utils.ts           # cn() + small shared helpers
   └─ components/
       ├─ ui/                # shadcn-style primitives (owned source):
       │                     #   button, badge, card, progress, select, tabs
       └─ views/             # the six synchronized views (all projections of one RunState):
           ├─ ScatterView.tsx        # "The Answers"  — dots vs the truth line (landing view)
           ├─ ConvergenceView.tsx    # "Does it settle down?" — running average vs truth
           ├─ DistributionView.tsx   # "The spread" — histogram of answers
           ├─ MechanismView.tsx      # "Show me what each did" — A prose vs B formula/SQL
           ├─ HumanVsAiView.tsx      # "You've seen this before" — hurried human / analyst / AI
           └─ ScorecardView.tsx      # "So what?" — verdict + cost of a wrong number
```

---

## How it works

### One stream, one source of truth

All six views are **projections of the same accumulating run state**. Views
never fetch; they read from a shared model produced by one streaming hook. This
is what makes "same question, same data" credible — every view literally reads
the same array.

- `useRunStream` (in `src/hooks/`) is the **only** place that talks to the
  network and the **only** place that mutates run state. It opens exactly one
  `EventSource` per run, parses each message at a single validated boundary, and
  folds events into `RunState` via a reducer.
- Components are pure functions of `(runState, uiState)`.

### The SSE contract

The backend streams three event types on `GET /api/stream?question=&runs=`,
modeled as a discriminated union in `src/lib/types.ts`:

| `type` | Meaning |
|---|---|
| `truth` | The correct answer + its unit. Arrives **first** so every dot is read relative to truth. |
| `run` | One agent's answer for one run (`agent`, `run_index`, `answer`, `correct`, `error`, `sql`, `detail`). |
| `summary` | Per-agent stats (`distinct_values`, `mean`, `stdev`, …) + the overall `verdict`. |

SSE payloads are untrusted strings until parsed and narrowed. A single
`parseStreamEvent` function is the only place `JSON.parse` output crosses into
typed territory; malformed lines are skipped rather than crashing the stream.

### Streaming edge cases (handled in `useRunStream`)

- **No auto-reconnect on a finite run.** `EventSource` auto-reconnects on drop;
  the hook calls `es.close()` on the `summary` event so a finished run never
  silently re-opens and replays. *(This is the single most important bug to
  avoid.)*
- **Clean close ≠ error.** `EventSource.onerror` also fires when the server
  closes the stream after the final event; the hook guards against downgrading a
  completed run to an error state.
- **Rapid re-runs are safe.** `start()` closes any prior stream and resets state
  first, so clicking Run again mid-stream is deterministic.
- **StrictMode-safe.** `start()` is user-triggered (imperative), not an effect,
  so React 19's dev-only double-mount does not double-start the stream.

---

## Accessibility & presentation notes

The demo relies on a "right vs wrong" signal, so meaning is **never encoded in
color alone**:

- **Correctness** = color **+** icon (✓ / ✕) **+** text.
- **Agent identity** = color **+** shape (A = circle, B = square) **+** position
  band **+** label.
- Palette is **color-blind-safe** (Okabe–Ito-derived); A = amber (caution),
  B = teal (trustworthy), truth = neutral dashed reference — deliberately *not*
  red/green.
- `prefers-reduced-motion` is respected: dots and lines appear at final
  positions instead of animating. The scatter-vs-stack contrast is spatial, so
  the message still lands.
- Dark-first theme for projector legibility, with high-contrast and light
  "handout" variants.

See the design brief for the full system, microcopy deck, and the three-act
narrative these views are sequenced to tell.

---

## Troubleshooting

- **Blank data / "couldn't reach the demo server":** the backend isn't running
  on `:8000`, or you opened the Vite URL without starting uvicorn.
- **Dots arrive all at once instead of streaming:** a buffering layer is sitting
  in front of the SSE stream. In dev the Vite proxy streams by default; in
  production the SPA is served same-origin by FastAPI with no extra proxy. If you
  add a reverse proxy, configure it **not** to buffer `text/event-stream`.
- **API 404s after building:** ensure the backend registers `/api/*` routes
  **before** mounting the SPA at `/`, so the static mount never shadows the API.
- **Type errors on build:** `npm run build` runs `tsc -b` first; fix reported
  types before Vite emits.
