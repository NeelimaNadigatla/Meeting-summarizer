from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """App settings, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'dev.db').as_posix()}"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 60 * 24
    summarizer_provider: str = "mock"  # "mock" or "claude"
    anthropic_api_key: str | None = None
    cors_origins: str = "http://localhost:5173"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Hosts like Neon and Render give URLs starting with "postgres://" or "postgresql://".
        # SQLAlchemy needs to be told to use the psycopg (v3) driver we installed.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
