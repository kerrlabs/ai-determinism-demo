"""The two agents at the heart of the demo.

Agent A  (non-deterministic): we dump the raw rows into the prompt and ask the
          LLM to compute the answer itself. The *model* does the arithmetic via
          token sampling, so repeated runs at temperature > 0 scatter -- and
          some runs are simply wrong.

Agent B  (deterministic): we ask the LLM only to translate the question into
          SQL. A real SQLite engine then executes that SQL against the data.
          The model never touches the numbers, so the executed result is exact
          and identical across runs.

Both agents answer the SAME question against the SAME data. The difference is
*where the computation happens*: inside the model vs. inside a deterministic
engine.
"""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass

import pandas as pd

from app.config import DB_PATH
from app.providers import LLMProvider
from app.questions import Question

# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


@dataclass
class AgentResult:
    agent: str          # "A" or "B"
    answer: float | None
    raw: str            # raw text the model returned
    error: str | None = None
    sql: str | None = None  # Agent B only: the SQL it generated


# ---------------------------------------------------------------------------
# Shared data access
# ---------------------------------------------------------------------------


def _load_rows_as_text(limit: int | None = None) -> str:
    """Return the sales table as CSV text to embed in Agent A's prompt."""
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query("SELECT * FROM sales", conn)
    finally:
        conn.close()
    if limit is not None:
        df = df.head(limit)
    return df.to_csv(index=False)


def _execute_sql(sql: str) -> float | None:
    """Run read-only SQL against the sales DB and return a single number."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(sql)
        row = cur.fetchone()
    finally:
        conn.close()
    if row is None or row[0] is None:
        return None
    return float(row[0])


# ---------------------------------------------------------------------------
# Answer parsing helpers
# ---------------------------------------------------------------------------


def _parse_number_from_json(text: str) -> float | None:
    """Pull {"answer": <number>} out of the model's reply, tolerating noise."""
    # Try strict JSON first.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "answer" in obj:
            return float(obj["answer"])
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # Fall back: find the first JSON-looking "answer": number.
    m = re.search(r'"answer"\s*:\s*(-?\d+(?:\.\d+)?)', text)
    if m:
        return float(m.group(1))

    # Last resort: first standalone number in the text.
    m = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group(0)) if m else None


def _extract_sql(text: str) -> str:
    """Extract a SQL statement from the model reply (handles code fences)."""
    fenced = re.search(r"```(?:sql)?\s*(.+?)```", text, re.DOTALL | re.IGNORECASE)
    candidate = fenced.group(1) if fenced else text
    candidate = candidate.strip().rstrip(";").strip()
    return candidate


_FORBIDDEN_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|attach|pragma|replace)\b",
    re.IGNORECASE,
)


def _is_safe_select(sql: str) -> bool:
    """Allow only single read-only SELECT statements."""
    if ";" in sql.strip().rstrip(";"):
        return False  # no multiple statements
    if _FORBIDDEN_SQL.search(sql):
        return False
    return sql.strip().lower().startswith("select")


# ---------------------------------------------------------------------------
# Agent A -- non-deterministic (model computes over raw data)
# ---------------------------------------------------------------------------

AGENT_A_SYSTEM = (
    "You are a data analyst. You will be given the FULL contents of a sales "
    "table as CSV, followed by a question. Compute the answer yourself from "
    "the rows. Respond with ONLY a JSON object of the form "
    '{"answer": <number>} and nothing else. Do not show your work.'
)


def run_agent_a(
    provider: LLMProvider,
    question: Question,
    temperature: float,
    truth_hint: float | None = None,
) -> AgentResult:
    """Non-deterministic agent: raw data in the prompt, model does the math."""
    rows_csv = _load_rows_as_text()
    user = (
        f"Here is the sales table as CSV:\n\n{rows_csv}\n\n"
        f"Question: {question.prompt}\n"
    )
    # Hint consumed only by MockProvider for offline simulation; harmless to
    # real providers but we only attach it when a hint is supplied.
    if truth_hint is not None:
        user += f"\n<<MOCK_TRUTH:{truth_hint}>>"

    try:
        raw = provider.complete(AGENT_A_SYSTEM, user, temperature)
        answer = _parse_number_from_json(raw)
        if answer is None:
            return AgentResult("A", None, raw, error="could not parse a number")
        return AgentResult("A", answer, raw)
    except Exception as exc:  # noqa: BLE001 - surface any provider error
        return AgentResult("A", None, "", error=str(exc))


# ---------------------------------------------------------------------------
# Agent B -- deterministic (model writes SQL, engine executes)
# ---------------------------------------------------------------------------

AGENT_B_SYSTEM = (
    "You are a text-to-SQL translator for a SQLite database. There is one "
    "table named 'sales' with columns: order_id (int), order_date (text "
    "YYYY-MM-DD), quarter (text like 'Q1'), region (text), category (text), "
    "product (text), quantity (int), unit_price (real), revenue (real). "
    "Given a question, respond with ONLY a single read-only SQL SELECT "
    "statement that returns one column aliased AS answer. Do not explain. "
    "Wrap the SQL in a ```sql code block."
)


def run_agent_b(
    provider: LLMProvider,
    question: Question,
    temperature: float,
) -> AgentResult:
    """Deterministic agent: model emits SQL, SQLite computes the answer."""
    user = f"Question: {question.prompt}"
    # For the mock provider only: embed the canonical SQL so the offline
    # simulation can echo a correct query. Real providers ignore this.
    user += f"\n\n<<MOCK_SQL:{question.truth_sql}>>"

    try:
        raw = provider.complete(AGENT_B_SYSTEM, user, temperature)
        sql = _extract_sql(raw)
        if not _is_safe_select(sql):
            return AgentResult(
                "B", None, raw, error=f"unsafe or non-SELECT SQL: {sql!r}", sql=sql
            )
        answer = _execute_sql(sql)
        if answer is None:
            return AgentResult("B", None, raw, error="query returned no value", sql=sql)
        return AgentResult("B", round(answer, 2), raw, sql=sql)
    except Exception as exc:  # noqa: BLE001
        return AgentResult("B", None, "", error=str(exc))
