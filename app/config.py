"""Application configuration loaded from environment / .env file."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = parent of the "app" package directory.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "sales.db"
CSV_PATH = DATA_DIR / "sales.csv"


class Settings(BaseSettings):
    """Strongly-typed settings. Values come from env vars or the .env file."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider selection
    llm_provider: str = "mock"
    llm_model: str = "gpt-4o-mini"

    # Agent behaviour
    agent_a_temperature: float = 0.7
    agent_b_temperature: float = 0.0
    default_runs: int = 20

    # OpenAI
    openai_api_key: str | None = None

    # Bedrock / AWS
    aws_region: str = "us-east-1"


settings = Settings()
