"""GeoJSON vulnerability layers + lightweight raster tile access for the map UI."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings

router = APIRouter()

_ZONES_PATH = Path(__file__).resolve().parents[4] / "app" / "data" / "kerala_zones.geojson"


@router.get("/layers/kerala-zones", summary="High-risk Western Ghats vulnerability zones (GeoJSON).")
def get_kerala_zones() -> dict:
    if not _ZONES_PATH.exists():
        raise HTTPException(status_code=404, detail="Zones layer not found on disk.")
    return json.loads(_ZONES_PATH.read_text())


@router.get("/tiles/processed/{filename}", summary="Fetch a synthesized GeoTIFF/NPY artifact by filename.")
def get_processed_tile(filename: str):
    settings = get_settings()
    safe_name = Path(filename).name  # prevent path traversal
    file_path = settings.DATA_PROCESSED_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Processed artifact not found.")
    return FileResponse(file_path)
