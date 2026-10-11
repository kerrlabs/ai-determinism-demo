# AI Determinism Demo

A side-by-side demonstration of a core principle for building reliable AI
systems:

- **Point an AI directly at your data and ask it to compute the answer → results are non-deterministic.**
- **Use the AI to write a query, and let a deterministic engine run it → results are exact and reproducible.**

Both agents answer the **same question** against the **same data**. The only
difference is *where the computation happens*.

| | Agent A — "AI reads the data" | Agent B — "AI writes the query" |
|---|---|---|
| Who computes the answer | the LLM (token sampling) | the SQLite engine |
| Source of variability | sampling temperature, phrasing | none |
| Typical result over 20 runs | many distinct answers, often wrong | one answer, exactly correct |

An animated web UI shows Agent A's answers **scatter** across runs while
Agent B's **lock onto the ground-truth line**.

---

## How it works

```
            ┌─────────────────────────────┐
            │  seeded synthetic sales data │  (2000 rows, fixed RNG seed)
            │  CSV + SQLite (table: sales) │
            └──────────────┬──────────────┘
                           │
        ┌──────────────────┴───────────────────┐
        │                                       │
  Agent A (non-deterministic)            Agent B (deterministic)
  raw rows → prompt                      question → LLM → SQL
  LLM computes the number                SQLite executes the SQL
        │                                       │
        └──────────────┬────────────────────────┘
                       │
              scored vs. ground truth
          (canonical SQL run against the data)
```

- **Ground truth** is computed by running a canonical SQL query directly
  against the data. The canonical SQL is never shown to either agent.
- **Agent A** runs at temperature > 0 (default `0.7`) — this is required for
  the non-determinism to be real rather than incidental.
- **Agent B**'s determinism does **not** depend on temperature; the SQLite
  engine produces the exact answer regardless.

---

## Project layout

```
ai-determinism-demo/
├─ app/
│  ├─ config.py      # settings from env / .env
│  ├─ data.py        # seeded dataset generator + SQLite loader
│  ├─ questions.py   # question set + ground-truth (canonical SQL)
│  ├─ providers.py   # LLMProvider: OpenAI | Bedrock | mock
│  ├─ agents.py      # Agent A (data-in-prompt) and Agent B (AI writes SQL)
│  ├─ harness.py     # runs both agents N times, scores, streams events
│  └─ server.py      # FastAPI app: static UI + SSE stream endpoint
├─ web/
│  ├─ index.html     # two-lane animated UI
│  ├─ style.css
│  └─ app.js         # SSE client + dot animation + live tallies
├─ data/             # generated sales.csv / sales.db (gitignored)
├─ requirements.txt
└─ .env.example
```

---

## Quick start (Windows / PowerShell)

```powershell
# 1. Create a virtual environment and install dependencies
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. Build the seeded dataset (writes data/sales.csv and data/sales.db)
.\.venv\Scripts\python.exe -m app.data

# 3. Configure a provider
copy .env.example .env
#   Then edit .env:
#     - For an offline demo (no API key):   LLM_PROVIDER=mock
#     - For a real OpenAI run:               LLM_PROVIDER=openai + OPENAI_API_KEY

# 4. Launch the web UI
.\.venv\Scripts\python.exe -m uvicorn app.server:app --reload --port 8000
```

Then open <http://127.0.0.1:8000>, pick a question, and click **Run comparison**.

### macOS / Linux

Replace `.\.venv\Scripts\python.exe` with `.venv/bin/python` and `copy` with `cp`.

---

## Running without the UI

```powershell
# Prints the determinism verdict for one question (mock provider shown)
$env:LLM_PROVIDER="mock"
.\.venv\Scripts\python.exe -m app.harness q2_revenue_west_q3 20
```

Example output:

```
Agent A produced 20 distinct answer(s) (1/20 correct);
Agent B produced 1 distinct answer(s) (20/20 correct).
A is NON-deterministic; B is deterministic.
```

---

## Providers

Set `LLM_PROVIDER` in `.env`:

| Value | Behaviour |
|-------|-----------|
| `openai`  | Real OpenAI chat completions. Needs `OPENAI_API_KEY`. Default for local dev. |
| `bedrock` | AWS Bedrock (Anthropic Claude messages API). Uses the standard AWS credential chain and `AWS_REGION`. Intended for cloud deployment. |
| `mock`    | No network calls. Simulates the behavioural contrast so the demo runs fully offline. |

The provider is chosen by a single factory (`app/providers.py :: get_provider`),
so adding a provider or switching to Bedrock for a cloud deployment requires no
changes to the agents or harness.

---

## The question set

Five questions of increasing difficulty (`app/questions.py`). Difficulty
matters: the model's error rate on Agent A tends to grow with the complexity of
the aggregation, which strengthens the point.

1. **easy** — count of West-region orders
2. **medium** — total West revenue in Q3
3. **medium** — average revenue per Electronics order
4. **hard** — total Furniture units sold in East during Q4
5. **hard** — West region's share of total revenue (a ratio)

---

## Notes

- The dataset is regenerated deterministically from seed `42`, so "same data"
  is literally true across machines and runs.
- Agent B only executes read-only single-statement `SELECT`s (guarded in
  `app/agents.py`); anything else is rejected before it touches the database.
- `.env` and generated `data/` artifacts are gitignored.
```
