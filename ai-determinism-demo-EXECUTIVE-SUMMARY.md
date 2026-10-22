# Executive Summary: AI Determinism Demo

## Purpose

A teaching demo that shows one principle of reliable AI systems: where computation happens decides whether results are trustworthy.

- AI reads the data and computes the answer itself: non-deterministic, often wrong.
- AI writes a query that a deterministic engine (SQLite) runs: exact and correct every time.

Both agents answer the same question against the same seeded data. Agent A (the Guesser) scatters across runs; Agent B (the Formula Writer) locks onto the correct answer.

## Documentation set

| Document | Scope | Status |
|---|---|---|
| `README.md` | Product thesis, architecture, setup, providers, questions | Authoritative |
| `ai-determinism-demo-design-spec.md` | UX and design (narrative, flow, visual system) | Complete |
| `ai-determinism-demo-ARCHITECTURE.md` | Frontend architecture, SSE typing, FastAPI integration, build plan | Complete, React version reconciled to 19 |
| `frontend/README.md` | Frontend guide: stack, setup, structure, SSE contract | Rewritten, build-verified |

All four are committed to `main`.

## Architecture

Backend is FastAPI plus Uvicorn with seeded sales data (2000 rows, seed 42) in CSV and SQLite. A harness runs both agents N times, scores them against a hidden canonical SQL ground truth, and streams results over SSE. Agent A reasons at temperature 0.7; Agent B emits a read-only SELECT that SQLite executes. Providers (`openai`, `bedrock`, `mock`) are pluggable through one factory. Verified on Bedrock Claude Sonnet 4.5: Agent A got 0 of 10 correct with 10 distinct answers; Agent B got 10 of 10 with 1 answer.

## Frontend redesign

A React UI reframes the story for a non-technical, spreadsheet-literate audience.

- Design brief: a three-act narrative (hook, proof, reveal) with the "aha" at the end of Act 2, jargon hidden behind a "technical version" expander, six views mapped onto the acts in Guided and Explore modes, and a color-blind-safe system (Okabe-Ito palette, meaning never by color alone, reduced-motion fallback).
- Architecture brief: one `useRunStream` hook owns all network and state; six views are pure projections of one `RunState`; SSE events are a typed discriminated union parsed at a single boundary; charts are custom SVG. Hard constraint: backend logic is untouched except a one-line static mount for `frontend-dist/`.

## Verification and hygiene

- React version reconciled from 18 to 19 across the architecture spec; no stale labels remain.
- `npm run build` passes (exit 0), confirming the documented stack and build command.
- Added root-anchored `/node_modules/` and `/dist/` to `.gitignore`, verified with `git check-ignore`.
- Architecture brief directory diagram aligned with the implemented `src/` layout (`lib/` and `hooks/` consolidation).
