"""Question set and ground-truth answers.

Each question carries:
  - a natural-language prompt (what we ask both agents)
  - the canonical SQL that defines the *correct* answer
  - a difficulty label

Ground truth is computed by executing the canonical SQL against the SQLite
database. This is the "source of truth" we score both agents against. Note
that the canonical SQL is NOT shown to the agents -- Agent B must write its
own SQL, and Agent A never sees SQL at all.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from app.config import DB_PATH


@dataclass(frozen=True)
class Question:
    id: str
    difficulty: str
    prompt: str
    truth_sql: str
    unit: str  # "currency", "count", or "ratio" -- used for display/scoring
    formula: str  # Excel-style formula a human analyst would write (teaching aid)


QUESTIONS: list[Question] = [
    Question(
        id="q1_count_west",
        difficulty="easy",
        prompt="How many orders are from the West region?",
        truth_sql="SELECT COUNT(*) AS answer FROM sales WHERE region = 'West';",
        unit="count",
        formula='=COUNTIF(region, "West")',
    ),
    Question(
        id="q2_revenue_west_q3",
        difficulty="medium",
        prompt="What is the total revenue for the West region in Q3? "
        "Answer in dollars.",
        truth_sql=(
            "SELECT ROUND(SUM(revenue), 2) AS answer FROM sales "
            "WHERE region = 'West' AND quarter = 'Q3';"
        ),
        unit="currency",
        formula='=SUMIFS(revenue, region, "West", quarter, "Q3")',
    ),
    Question(
        id="q3_avg_electronics_order",
        difficulty="medium",
        prompt="What is the average revenue per order for the Electronics "
        "category? Answer in dollars.",
        truth_sql=(
            "SELECT ROUND(AVG(revenue), 2) AS answer FROM sales "
            "WHERE category = 'Electronics';"
        ),
        unit="currency",
        formula='=AVERAGEIF(category, "Electronics", revenue)',
    ),
    Question(
        id="q4_units_furniture_east_q4",
        difficulty="hard",
        prompt="How many total units (sum of quantity) of Furniture were sold "
        "in the East region during Q4?",
        truth_sql=(
            "SELECT SUM(quantity) AS answer FROM sales "
            "WHERE category = 'Furniture' AND region = 'East' AND quarter = 'Q4';"
        ),
        unit="count",
        formula='=SUMIFS(quantity, category, "Furniture", region, "East", quarter, "Q4")',
    ),
    Question(
        id="q5_west_share_of_total_revenue",
        difficulty="hard",
        prompt="What percentage of total company revenue comes from the West "
        "region? Answer as a percentage rounded to two decimals.",
        truth_sql=(
            "SELECT ROUND("
            "  100.0 * (SELECT SUM(revenue) FROM sales WHERE region = 'West') "
            "  / (SELECT SUM(revenue) FROM sales), 2) AS answer;"
        ),
        unit="ratio",
        formula='=SUMIF(region, "West", revenue) / SUM(revenue) * 100',
    ),
]

QUESTIONS_BY_ID = {q.id: q for q in QUESTIONS}


def compute_truth(question: Question) -> float:
    """Execute the canonical SQL and return the ground-truth numeric answer."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(question.truth_sql)
        row = cur.fetchone()
    finally:
        conn.close()
    if row is None or row[0] is None:
        return 0.0
    return float(row[0])


def all_truths() -> dict[str, float]:
    """Return {question_id: ground_truth} for every question."""
    return {q.id: compute_truth(q) for q in QUESTIONS}


if __name__ == "__main__":
    for q in QUESTIONS:
        print(f"[{q.difficulty:6}] {q.id}: {compute_truth(q)}")
