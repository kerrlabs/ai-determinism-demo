"""Comparison / scoring harness.

Runs Agent A and Agent B N times each against a question, scores every run
against the ground truth, and summarises the distributions. Supports both a
blocking API (run_question) and a streaming generator (stream_question) that
yields each run as it completes -- the latter feeds the live web UI.
"""
from __future__ import annotations

import statistics
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from typing import Any

from app.agents import AgentResult, run_agent_a, run_agent_b
from app.config import settings
from app.providers import LLMProvider, MockProvider, get_provider
from app.questions import Question, QUESTIONS_BY_ID, compute_truth

# Relative tolerance for calling an answer "correct" (0.5%).
CORRECT_TOLERANCE = 0.005


def is_correct(answer: float | None, truth: float) -> bool:
    if answer is None:
        return False
    if truth == 0:
        return abs(answer) < 1e-9
    return abs(answer - truth) / abs(truth) <= CORRECT_TOLERANCE


@dataclass
class RunEvent:
    """A single completed run of one agent."""

    agent: str
    run_index: int
    answer: float | None
    correct: bool
    error: str | None = None
    sql: str | None = None
    detail: str | None = None  # Agent A: reasoning text; Agent B: unused (sql holds it)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentSummary:
    agent: str
    answers: list[float] = field(default_factory=list)
    n_runs: int = 0
    n_correct: int = 0
    n_errors: int = 0
    distinct_values: int = 0
    mean: float | None = None
    stdev: float | None = None
    min: float | None = None
    max: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _summarise(agent: str, events: list[RunEvent]) -> AgentSummary:
    answers = [e.answer for e in events if e.answer is not None]
    s = AgentSummary(agent=agent)
    s.n_runs = len(events)
    s.n_correct = sum(1 for e in events if e.correct)
    s.n_errors = sum(1 for e in events if e.error is not None)
    s.answers = answers
    if answers:
        s.distinct_values = len({round(a, 2) for a in answers})
        s.mean = round(statistics.fmean(answers), 4)
        s.stdev = round(statistics.pstdev(answers), 4) if len(answers) > 1 else 0.0
        s.min = min(answers)
        s.max = max(answers)
    return s


def stream_question(
    question: Question,
    runs: int,
    provider: LLMProvider | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield dict events as each run completes, then a final summary event.

    Event shapes:
      {"type": "truth", "value": <float>}
      {"type": "run", ...RunEvent fields...}
      {"type": "summary", "A": {...}, "B": {...}, "verdict": "..."}
    """
    provider = provider or get_provider()
    truth = compute_truth(question)
    yield {"type": "truth", "value": truth, "unit": question.unit}

    # The truth hint is ONLY for the offline MockProvider's simulation. A real
    # provider must never see it, or it would just read the answer off the
    # prompt instead of computing (and the demo would be meaningless).
    hint = truth if isinstance(provider, MockProvider) else None

    a_events: list[RunEvent] = []
    b_events: list[RunEvent] = []

    for i in range(runs):
        # Agent A (non-deterministic)
        a: AgentResult = run_agent_a(
            provider, question, settings.agent_a_temperature, truth_hint=hint
        )
        a_evt = RunEvent(
            agent="A",
            run_index=i,
            answer=a.answer,
            correct=is_correct(a.answer, truth),
            error=a.error,
            detail=(a.raw[:1200] if a.raw else None),
        )
        a_events.append(a_evt)
        yield {"type": "run", **a_evt.to_dict()}

        # Agent B (deterministic)
        b: AgentResult = run_agent_b(
            provider,
            question,
            settings.agent_b_temperature,
            mock_sql_hint=isinstance(provider, MockProvider),
        )
        b_evt = RunEvent(
            agent="B",
            run_index=i,
            answer=b.answer,
            correct=is_correct(b.answer, truth),
            error=b.error,
            sql=b.sql,
        )
        b_events.append(b_evt)
        yield {"type": "run", **b_evt.to_dict()}

    a_sum = _summarise("A", a_events)
    b_sum = _summarise("B", b_events)
    yield {
        "type": "summary",
        "truth": truth,
        "A": a_sum.to_dict(),
        "B": b_sum.to_dict(),
        "verdict": _verdict(a_sum, b_sum),
    }


def _verdict(a: AgentSummary, b: AgentSummary) -> str:
    a_det = a.distinct_values <= 1
    b_det = b.distinct_values <= 1
    return (
        f"Agent A produced {a.distinct_values} distinct answer(s) "
        f"({a.n_correct}/{a.n_runs} correct); "
        f"Agent B produced {b.distinct_values} distinct answer(s) "
        f"({b.n_correct}/{b.n_runs} correct). "
        f"A is {'deterministic' if a_det else 'NON-deterministic'}; "
        f"B is {'deterministic' if b_det else 'NON-deterministic'}."
    )


def run_question(question: Question, runs: int) -> dict[str, Any]:
    """Blocking variant: consume the stream and return only the summary."""
    summary: dict[str, Any] = {}
    for event in stream_question(question, runs):
        if event["type"] == "summary":
            summary = event
    return summary


if __name__ == "__main__":
    import sys

    qid = sys.argv[1] if len(sys.argv) > 1 else "q2_revenue_west_q3"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else settings.default_runs
    q = QUESTIONS_BY_ID[qid]
    print(f"Question: {q.prompt}")
    result = run_question(q, n)
    print(result["verdict"])
    print(f"  truth = {result['truth']}")
    print(f"  A answers (sample): {result['A']['answers'][:10]}")
    print(f"  B answers (sample): {result['B']['answers'][:10]}")
