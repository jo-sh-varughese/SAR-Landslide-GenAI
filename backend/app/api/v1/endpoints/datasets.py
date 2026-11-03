"""Dataset inventory endpoints — reflects what `scripts/download_datasets.py` has fetched."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


@router.get("/datasets", summary="List raw + processed dataset files currently on disk.")
def list_datasets() -> dict:
    settings = get_settings()

    def _describe(directory: Path) -> list[dict]:
        if not directory.exists():
            return []
        items = []
        for path in sorted(directory.glob("*")):
            if path.name == ".gitkeep" or path.is_dir():
                continue
            items.append(
                {
                    "filename": path.name,
                    "size_bytes": path.stat().st_size,
                    "extension": path.suffix.lstrip("."),
                }
            )
        return items

    raw = _describe(settings.DATA_RAW_DIR)
    processed = _describe(settings.DATA_PROCESSED_DIR)

    return {
        "raw_dir": str(settings.DATA_RAW_DIR),
        "processed_dir": str(settings.DATA_PROCESSED_DIR),
        "raw_files": raw,
        "processed_files": processed,
        "sources": [
            {
                "name": "Zenodo Landslide Reference Data (Sentinel-1 & 2)",
                "url": settings.ZENODO_LANDSLIDE_RECORD,
            },
            {
                "name": "GLaD4CD (Global Landslide Dataset for Change Detection)",
                "url": settings.GLAD4CD_RECORD,
            },
            {
                "name": "ASF Sentinel-1 GRD (Idukki / Wayanad)",
                "url": "https://search.asf.alaska.edu/",
            },
        ],
    }
