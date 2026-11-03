"""Application configuration loaded from environment variables / .env file."""
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "SAR-Landslide-GenAI"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Security
    API_KEY: str = "dev-local-key"
    REQUIRE_API_KEY: bool = False

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Celery / Redis (background inference jobs)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_TASK_ALWAYS_EAGER: bool = True  # run inline if no Redis broker is running

    # Data locations
    DATA_RAW_DIR: Path = PROJECT_ROOT / "data" / "raw"
    DATA_PROCESSED_DIR: Path = PROJECT_ROOT / "data" / "processed"
    MODEL_WEIGHTS_DIR: Path = BACKEND_ROOT / "app" / "models" / "weights"

    # External data sources
    ZENODO_LANDSLIDE_RECORD: str = "https://zenodo.org/records/15421843"
    GLAD4CD_RECORD: str = "https://zenodo.org/records/14226448"
    ASF_USERNAME: str = ""
    ASF_PASSWORD: str = ""

    # Western Ghats (Kerala) points of interest
    IDUKKI_LAT: float = 9.8500
    IDUKKI_LON: float = 76.9667
    WAYANAD_LAT: float = 11.6854
    WAYANAD_LON: float = 76.1320

    # Diffusion inference defaults
    DEFAULT_DIFFUSION_STEPS: int = 25
    HAZARD_TILE_SIZE: int = 256


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    settings.DATA_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    return settings
