"""FastAPI backend.

Serves the static web UI and exposes:

  GET /api/config               -> current provider/model/temps/default runs
  GET /api/questions            -> the question set (no canonical SQL leaked)
  GET /api/stream?question=&runs=  -> Server-Sent Events stream of run results

The harness is synchronous (SQLite + provider calls), so the streaming
endpoint runs it in a worker thread and bridges events to the async response
through a thread-safe queue.
"""
from __future__ import annotations

import asyncio
import json
import queue
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.harness import stream_question
from app.questions import QUESTIONS, QUESTIONS_BY_ID

app = FastAPI(title="AI Determinism Demo")

STATIC_DIR = Path(__file__).resolve().parent.parent / "web"


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return {
        "provider": settings.llm_provider,
        "model": settings.llm_model,
        "agent_a_temperature": settings.agent_a_temperature,
        "agent_b_temperature": settings.agent_b_temperature,
        "default_runs": settings.default_runs,
    }


@app.get("/api/questions")
def get_questions() -> list[dict[str, Any]]:
    # Deliberately omit truth_sql so the canonical query is never exposed.
    return [
        {
            "id": q.id,
            "difficulty": q.difficulty,
            "prompt": q.prompt,
            "unit": q.unit,
            "formula": q.formula,
        }
        for q in QUESTIONS
    ]


def _run_in_thread(question_id: str, runs: int, out: queue.Queue) -> None:
    """Execute the blocking harness, pushing each event onto a queue."""
    try:
        question = QUESTIONS_BY_ID[question_id]
        for event in stream_question(question, runs):
            out.put(event)
    except Exception as exc:  # noqa: BLE001 - report errors to the client
        out.put({"type": "error", "message": str(exc)})
    finally:
        out.put(None)  # sentinel: stream finished


@app.get("/api/stream")
async def stream(
    question: str = Query(...),
    runs: int = Query(default=0, ge=1, le=200),
) -> StreamingResponse:
    if question not in QUESTIONS_BY_ID:
        async def err() -> Any:
            yield _sse({"type": "error", "message": f"unknown question {question!r}"})
        return StreamingResponse(err(), media_type="text/event-stream")

    n = runs or settings.default_runs
    out: queue.Queue = queue.Queue()
    worker = threading.Thread(
        target=_run_in_thread, args=(question, n, out), daemon=True
    )
    worker.start()

    async def event_generator() -> Any:
        loop = asyncio.get_event_loop()
        while True:
            event = await loop.run_in_executor(None, out.get)
            if event is None:
                break
            yield _sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


# Serve CSS/JS and any other static assets.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
