"""Provider-agnostic LLM abstraction.

A single `LLMProvider` interface with three adapters:

  - OpenAIProvider  : real OpenAI chat completions (default for local dev)
  - BedrockProvider : AWS Bedrock (for cloud deployment)
  - MockProvider    : no network calls; simulates the behavioural *contrast*
                      between the two agents so the demo runs offline.

Select the active provider with the LLM_PROVIDER setting (openai|bedrock|mock).

Each provider exposes a single method:

    complete(system, user, temperature) -> str

returning the raw text content of the model's reply.
"""
from __future__ import annotations

import json
import random
from abc import ABC, abstractmethod

from app.config import settings


class LLMProvider(ABC):
    """Minimal chat interface shared by all adapters."""

    @abstractmethod
    def complete(self, system: str, user: str, temperature: float) -> str:
        """Return the text content of the model's reply."""
        raise NotImplementedError


class OpenAIProvider(LLMProvider):
    def __init__(self, model: str, api_key: str | None):
        from openai import OpenAI

        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Add it to your .env file or set "
                "LLM_PROVIDER=mock to run offline."
            )
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(self, system: str, user: str, temperature: float) -> str:
        resp = self._client.chat.completions.create(
            model=self._model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content or ""


class BedrockProvider(LLMProvider):
    """AWS Bedrock adapter (Anthropic Claude messages API).

    Used when deploying to the cloud. Credentials come from the standard AWS
    credential chain (env vars, shared profile, or instance/role).
    """

    def __init__(self, model: str, region: str):
        import boto3

        self._client = boto3.client("bedrock-runtime", region_name=region)
        self._model = model

    def complete(self, system: str, user: str, temperature: float) -> str:
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}],
        }
        resp = self._client.invoke_model(
            modelId=self._model,
            body=json.dumps(body),
        )
        payload = json.loads(resp["body"].read())
        # Anthropic messages API returns a list of content blocks.
        parts = payload.get("content", [])
        return "".join(block.get("text", "") for block in parts)


class MockProvider(LLMProvider):
    """Offline simulator that reproduces the determinism contrast.

    It inspects the system prompt to decide which agent is calling:

      - Agent A (reasons over raw data) -> returns a JSON answer that is
        perturbed by `temperature`, so repeated calls scatter.
      - Agent B (writes SQL)            -> returns a fixed, correct-ish SQL
        string, so repeated calls are identical.

    The mock reads the embedded ground-truth hint that the harness passes in
    the user prompt (see agents.py) purely so the simulation is believable.
    It is NOT used by the real providers.
    """

    _MOCK_HINT = "<<MOCK_TRUTH:"

    def complete(self, system: str, user: str, temperature: float) -> str:
        truth = self._extract_truth(user)

        if "writes SQL" in system or "SQL" in system:
            # Deterministic branch: emit the canonical SQL embedded by the harness.
            sql = self._extract_sql(user)
            return f"```sql\n{sql}\n```"

        # Non-deterministic branch: jitter the answer by temperature.
        spread = max(temperature, 0.01) * 0.25 * (abs(truth) + 1.0)
        noisy = truth + random.uniform(-spread, spread)
        return json.dumps({"answer": round(noisy, 2)})

    def _extract_truth(self, user: str) -> float:
        if self._MOCK_HINT in user:
            try:
                chunk = user.split(self._MOCK_HINT, 1)[1]
                value = chunk.split(">>", 1)[0]
                return float(value)
            except (ValueError, IndexError):
                return 0.0
        return 0.0

    def _extract_sql(self, user: str) -> str:
        marker = "<<MOCK_SQL:"
        if marker in user:
            chunk = user.split(marker, 1)[1]
            return chunk.split(">>", 1)[0].strip()
        return "SELECT 0 AS answer;"


def get_provider() -> LLMProvider:
    """Factory: build the provider named by settings.llm_provider."""
    name = settings.llm_provider.lower()
    if name == "openai":
        return OpenAIProvider(settings.llm_model, settings.openai_api_key)
    if name == "bedrock":
        return BedrockProvider(settings.llm_model, settings.aws_region)
    if name == "mock":
        return MockProvider()
    raise ValueError(
        f"Unknown LLM_PROVIDER '{settings.llm_provider}'. "
        "Use one of: openai, bedrock, mock."
    )
