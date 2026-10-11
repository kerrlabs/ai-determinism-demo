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
    value = row[0]
    if isinstance(value, (int, float)):
        return float(value)
    # The model's SQL sometimes formats the result as text, e.g.
    # "$227,421.36", "227421.36 dollars", or "27.13%". The engine still
    # computed the correct number; extract the numeric portion from the text.
    text = str(value).replace(",", "")
    m = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(m.group(0)) if m else None


# ---------------------------------------------------------------------------
# Answer parsing helpers
# ---------------------------------------------------------------------------


_NUM = r"-?\d[\d,]*(?:\.\d+)?"


def _to_float(s: str) -> float:
    return float(s.replace(",", "").replace("$", "").rstrip("."))


def _parse_number_from_json(text: str) -> float | None:
    """Extract the model's final numeric answer, tolerating prose and noise.

    Real models (e.g. Claude) often ignore "JSON only" instructions and show
    their work, ending with a stated total. Grabbing the *first* number is
    wrong -- it catches stray digits like the "3" in "Q3". So we prefer, in
    order: an explicit FINAL ANSWER line, strict JSON, an "answer": value,
    other answer/total phrasing, a $-tagged figure, and finally the LAST
    number in the text (the conclusion), never the first.
    """
    if not text:
        return None

    # 1. The explicit contract: "FINAL ANSWER: <number>" (last one wins).
    fa = re.findall(r"FINAL ANSWER:\s*\$?\s*(" + _NUM + r")", text, re.IGNORECASE)
    if fa:
        return _to_float(fa[-1])

    # 2. Strict JSON object.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "answer" in obj:
            return _to_float(str(obj["answer"]))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # 3. A JSON-looking "answer": <number> anywhere (last wins).
    matches = re.findall(r'"answer"\s*:\s*(' + _NUM + r")", text)
    if matches:
        return _to_float(matches[-1])

    # 4. "total ... is $X" / "answer is X" phrasing (last wins).
    marker = re.findall(
        r"(?:answer|total)\b[^\d$]*\$?\s*(" + _NUM + r")", text, re.IGNORECASE
    )
    if marker:
        return _to_float(marker[-1])

    # 5. Last $-prefixed figure.
    dollars = re.findall(r"\$\s*(" + _NUM + r")", text)
    if dollars:
        return _to_float(dollars[-1])

    # 6. Last resort: the LAST standalone number (the conclusion), not first.
    nums = re.findall(_NUM, text)
    return _to_float(nums[-1]) if nums else None


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
    "the rows. Keep your working BRIEF: do NOT transcribe or list individual "
    "rows; reason about totals directly. You MUST end your reply with a final "
    "line in exactly this format:\n"
    "FINAL ANSWER: <number>\n"
    "where <number> is a plain number (no currency symbol, no commas)."
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
    mock_sql_hint: bool = False,
) -> AgentResult:
    """Deterministic agent: model emits SQL, SQLite computes the answer."""
    user = f"Question: {question.prompt}"
    # Embed the canonical SQL ONLY for the offline MockProvider so it can echo
    # a correct query. Real providers must never see it, or Agent B would be
    # handed the answer instead of translating the question itself.
    if mock_sql_hint:
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
