from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env directly from the backend/ directory — no pydantic-settings.
_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_ENV_PATH, override=False)


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    UPLOAD_DIR: str = "uploads"
    MODEL_PATH: str = "best.pt"
    DEBUG: bool = False


settings = Settings(
    DATABASE_URL=os.getenv("DATABASE_URL", ""),
    JWT_SECRET=os.getenv("JWT_SECRET", "change-me-in-.env"),
    JWT_ALGORITHM=os.getenv("JWT_ALGORITHM", "HS256"),
    JWT_ACCESS_EXPIRE_MINUTES=int(os.getenv("JWT_ACCESS_EXPIRE_MINUTES", "30")),
    JWT_REFRESH_EXPIRE_DAYS=int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7")),
    UPLOAD_DIR=os.getenv("UPLOAD_DIR", "uploads"),
    MODEL_PATH=os.getenv("MODEL_PATH", "best.pt"),
    DEBUG=_env_bool("DEBUG", False),
)