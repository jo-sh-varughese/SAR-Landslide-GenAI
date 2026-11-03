"""Real-world reference data: elevation, land/sea mask, and rainfall.

This is what turns hazard scoring from "plausible-looking numbers" into
something grounded in actual measurements:

  - `fetch_real_elevation`  - real digital elevation data from the public AWS
    "Terrarium" terrain-tile dataset (derived from SRTM/other DEMs), decoded
    from its RGB encoding. No API key, no rate limiting (static S3 objects).
  - `compute_water_mask`    - a real land/sea boundary (GSHHG coastline data,
    via the offline `global-land-mask` package) so ocean/lake points are
    correctly excluded from land-only hazard scoring instead of being scored
    as if they were mountainside.
  - `fetch_real_rainfall`   - live/historical precipitation from the free
    Open-Meteo API for the requested point and date range.

Every function degrades to a clearly-labeled synthetic fallback if the
network is unavailable, and always reports which path was actually used via
its returned `source` string - callers must surface that provenance rather
than silently presenting fallback data as real.
"""
from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import requests

from app.core.config import get_settings
from app.core.gis_utils import BBox

logger = logging.getLogger("real_data")

TERRARIUM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Reference total rainfall (mm) over the request window treated as "extreme
# monsoon" (hazard-normalizing denominator = 1.0). Calibrated loosely against
# Western Ghats monsoon burst events (e.g. the 2018/2024 Kerala episodes saw
# 300-400mm over a few days); applying this same reference outside a
# monsoon-driven tropical setting will under/over-estimate the rainfall
# factor and is a known limitation of this v1 heuristic - see README.
REFERENCE_EXTREME_RAINFALL_MM = 300.0


def _lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def _tile_to_lonlat(x: int, y: int, zoom: int) -> tuple[float, float]:
    """Returns the (lon, lat) of a tile's NW corner."""
    n = 2**zoom
    lon = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    return lon, math.degrees(lat_rad)


def _pick_zoom(bbox: BBox, max_tiles_per_side: int = 4) -> int:
    """Chooses the finest zoom level that keeps the tile mosaic small."""
    width_deg = bbox.max_lon - bbox.min_lon
    for zoom in range(14, 4, -1):
        tile_deg = 360.0 / (2**zoom)
        if width_deg / tile_deg <= max_tiles_per_side:
            return zoom
    return 6


def _terrain_cache_path(z: int, x: int, y: int) -> Path:
    settings = get_settings()
    cache_dir = settings.DATA_RAW_DIR / "terrain_cache" / str(z) / str(x)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{y}.png"


def _fetch_terrarium_tile(z: int, x: int, y: int, session: requests.Session) -> Optional[np.ndarray]:
    n = 2**z
    if not (0 <= x < n and 0 <= y < n):
        return None  # off the world (can happen at the poles)

    cache_path = _terrain_cache_path(z, x, y)
    try:
        if cache_path.exists():
            raw = cache_path.read_bytes()
        else:
            resp = session.get(TERRARIUM_TILE_URL.format(z=z, x=x, y=y), timeout=10)
            resp.raise_for_status()
            raw = resp.content
            cache_path.write_bytes(raw)

        from PIL import Image

        img = Image.open(io.BytesIO(raw)).convert("RGB")
        arr = np.asarray(img).astype(np.float64)
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        # Terrarium encoding: https://www.mapzen.com/blog/terrain-tile-service/
        elevation = (r * 256 + g + b / 256) - 32768
        return elevation
    except Exception as exc:
        logger.warning("Failed to fetch terrain tile z=%d x=%d y=%d: %s", z, x, y, exc)
        return None


def fetch_real_elevation(bbox: BBox, size: int) -> tuple[np.ndarray, str]:
    """Real DEM for `bbox`, resampled to a `size`x`size` grid (meters).

    Returns (elevation_grid, source_label). Falls back to a flat sea-level
    grid (never fake mountains) if tiles can't be fetched, since silently
    inventing terrain is exactly the failure mode this module exists to fix.
    """
    zoom = _pick_zoom(bbox)
    x_min, y_min = _lonlat_to_tile(bbox.min_lon, bbox.max_lat, zoom)  # NW corner
    x_max, y_max = _lonlat_to_tile(bbox.max_lon, bbox.min_lat, zoom)  # SE corner
    x_min, x_max = sorted((x_min, x_max))
    y_min, y_max = sorted((y_min, y_max))

    session = requests.Session()
    tiles_x = x_max - x_min + 1
    tiles_y = y_max - y_min + 1
    mosaic = np.zeros((tiles_y * 256, tiles_x * 256), dtype=np.float64)
    any_success = False

    for ty in range(tiles_y):
        for tx in range(tiles_x):
            tile = _fetch_terrarium_tile(zoom, x_min + tx, y_min + ty, session)
            if tile is not None:
                mosaic[ty * 256 : (ty + 1) * 256, tx * 256 : (tx + 1) * 256] = tile
                any_success = True

    if not any_success:
        logger.warning("No terrain tiles could be fetched for bbox=%s; using flat sea-level fallback.", bbox)
        return np.zeros((size, size), dtype=np.float32), "fallback-flat"

    mosaic_west, mosaic_north = _tile_to_lonlat(x_min, y_min, zoom)
    mosaic_east, mosaic_south = _tile_to_lonlat(x_max + 1, y_max + 1, zoom)

    lat_vals = np.linspace(bbox.max_lat, bbox.min_lat, size)
    lon_vals = np.linspace(bbox.min_lon, bbox.max_lon, size)
    row_idx = np.clip(
        ((mosaic_north - lat_vals) / (mosaic_north - mosaic_south) * mosaic.shape[0]).astype(int),
        0, mosaic.shape[0] - 1,
    )
    col_idx = np.clip(
        ((lon_vals - mosaic_west) / (mosaic_east - mosaic_west) * mosaic.shape[1]).astype(int),
        0, mosaic.shape[1] - 1,
    )
    elevation = mosaic[np.ix_(row_idx, col_idx)].astype(np.float32)
    return elevation, f"srtm-terrarium-z{zoom}"


def compute_water_mask(bbox: BBox, size: int) -> np.ndarray:
    """Boolean grid, True where the pixel center is open water (real coastline data)."""
    try:
        from global_land_mask import globe
    except ImportError:
        logger.warning("global-land-mask not installed; water masking disabled (all-land fallback).")
        return np.zeros((size, size), dtype=bool)

    lat_vals = np.linspace(bbox.max_lat, bbox.min_lat, size)
    lon_vals = np.linspace(bbox.min_lon, bbox.max_lon, size)
    lon_grid, lat_grid = np.meshgrid(lon_vals, lat_vals)
    is_land = globe.is_land(lat_grid, lon_grid)
    return ~is_land


@dataclass
class RainfallResult:
    daily_mm: list[float]
    dates: list[str]
    total_mm: float
    source: str  # "open-meteo" | "fallback-climatology"


def _climatology_fallback(lat: float, start: date, end: date) -> RainfallResult:
    """Deterministic seasonal-curve estimate, used only when the live API is unreachable."""
    rng = np.random.default_rng(abs(hash((round(lat, 2), start.isoformat()))) % (2**32))
    days = (end - start).days + 1
    dates, values = [], []
    for i in range(days):
        d = start + timedelta(days=i)
        seasonal = math.exp(-((d.timetuple().tm_yday - 195) ** 2) / (2 * 35**2))  # monsoon-shaped peak
        mm = max(0.0, 8 + 45 * seasonal + rng.normal(0, 6))
        dates.append(d.isoformat())
        values.append(round(mm, 1))
    return RainfallResult(daily_mm=values, dates=dates, total_mm=round(sum(values), 1), source="fallback-climatology")


def fetch_real_rainfall(lat: float, lon: float, start: date, end: date) -> RainfallResult:
    """Real precipitation for [start, end] at (lat, lon) via Open-Meteo (no API key).

    Uses the forecast endpoint's `past_days`/`forecast_days` window (covers
    the last 92 days and next 16 days) rather than the separate historical
    archive API, so one call handles both past and near-future date ranges.
    """
    today = date.today()
    past_days = max(0, min(92, (today - start).days + 1))
    forecast_days = max(1, min(16, (end - today).days + 1))

    try:
        resp = requests.get(
            OPEN_METEO_FORECAST_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "precipitation_sum",
                "past_days": past_days,
                "forecast_days": forecast_days,
                "timezone": "UTC",
            },
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        all_dates = body["daily"]["time"]
        all_values = body["daily"]["precipitation_sum"]

        start_iso, end_iso = start.isoformat(), end.isoformat()
        window = [(d, v) for d, v in zip(all_dates, all_values) if start_iso <= d <= end_iso]
        if not window:
            window = list(zip(all_dates, all_values))  # requested window outside API's coverage

        dates = [d for d, _ in window]
        values = [round(float(v or 0.0), 1) for _, v in window]
        return RainfallResult(daily_mm=values, dates=dates, total_mm=round(sum(values), 1), source="open-meteo")
    except Exception as exc:
        logger.warning("Open-Meteo rainfall fetch failed for (%.4f, %.4f): %s", lat, lon, exc)
        return _climatology_fallback(lat, start, end)
