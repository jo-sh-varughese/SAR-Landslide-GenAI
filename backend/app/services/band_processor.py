"""Raster band loading and GeoTIFF I/O.

Elevation comes from real SRTM-derived terrain tiles (`real_data.py`), the
land/water split from a real coastline dataset, and rainfall from a live
weather API — all with clearly-labeled synthetic fallbacks if the network is
unavailable. Sentinel-1 SAR is still synthetic (textured from the *real*
elevation's roughness) unless a matching tile exists under `data/raw` from
`scripts/download_datasets.py`: it's used only as an illustrative condition
input to the pseudo-optical image synthesis, never as a hazard-scoring input.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

from app.core.config import get_settings
from app.core.gis_utils import BBox, slope_from_dem
from app.services.real_data import RainfallResult, compute_water_mask, fetch_real_elevation, fetch_real_rainfall


@dataclass
class RasterStack:
    sar_vv: np.ndarray
    sar_vh: np.ndarray
    dem: np.ndarray
    baseline_optical: np.ndarray  # HxWx3, simulates a cloud-contaminated Sentinel-2 scene
    soil_saturation: np.ndarray
    slope_deg: np.ndarray
    water_mask: np.ndarray  # HxW bool, True = open water (real coastline data)
    rainfall: RainfallResult
    elevation_source: str  # "srtm-terrarium-zNN" | "fallback-flat"
    sar_source: str  # "raw-data" | "synthetic"


def _seed_from(bbox: BBox, start_date, end_date) -> int:
    key = f"{bbox.as_tuple()}|{start_date}|{end_date}"
    return int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)


def _find_raw_tile(pattern: str) -> Optional[Path]:
    settings = get_settings()
    matches = sorted(settings.DATA_RAW_DIR.glob(pattern))
    return matches[0] if matches else None


def _load_geotiff_band(path: Path, band: int = 1) -> Optional[np.ndarray]:
    try:
        import rasterio

        with rasterio.open(path) as src:
            return src.read(band).astype(np.float32)
    except Exception:
        return None


def load_raster_stack(
    bbox: BBox, start_date: date_type, end_date: date_type, size: int = 256
) -> RasterStack:
    seed = _seed_from(bbox, start_date, end_date)
    rng = np.random.default_rng(seed)
    center_lat, center_lon = bbox.center()[1], bbox.center()[0]

    dem, elevation_source = fetch_real_elevation(bbox, size)
    water_mask = compute_water_mask(bbox, size)
    rainfall = fetch_real_rainfall(center_lat, center_lon, start_date, end_date)

    vv_path = _find_raw_tile("*VV*.tif") or _find_raw_tile("*sar*.tif")
    if vv_path:
        vv = _load_geotiff_band(vv_path)
        vh = _load_geotiff_band(vv_path, band=2) if vv is not None else None
    else:
        vv = vh = None
    sar_source = "raw-data" if vv is not None else "synthetic"

    if vv is None:
        # Synthesize plausible SAR backscatter (dB-like range -25..0), textured by the
        # *real* DEM's roughness so it at least follows genuine terrain shape - this
        # feeds only the illustrative pseudo-optical synthesis, never hazard scoring.
        gy, gx = np.gradient(dem)
        roughness = np.clip(np.sqrt(gx**2 + gy**2) / (np.sqrt(gx**2 + gy**2).max() + 1e-9), 0, 1)
        vv = -22 + 14 * roughness + rng.normal(0, 1.2, size=(size, size))
        vh = -27 + 12 * roughness + rng.normal(0, 1.4, size=(size, size))
    else:
        vv = _resample(vv, size)
        vh = _resample(vh, size) if vh is not None else vv * 0.85

    elevation_range = max(dem.max() - dem.min(), 1e-6)
    elevation_n = (dem - dem.min()) / elevation_range

    # Baseline "cloudy" optical scene: vegetation index modulated by real elevation + cloud mask.
    veg = np.clip(0.7 - 0.35 * elevation_n + rng.normal(0, 0.05, size=(size, size)), 0, 1)
    cloud_mask = _cloud_mask(size, rng)
    r = np.clip(0.35 + 0.25 * (1 - veg), 0, 1)
    g = np.clip(0.3 + 0.5 * veg, 0, 1)
    b = np.clip(0.3 + 0.3 * elevation_n, 0, 1)
    baseline = np.stack([r, g, b], axis=-1)
    baseline = baseline * (1 - 0.85 * cloud_mask[..., None]) + cloud_mask[..., None] * 0.92
    baseline[water_mask] = [0.08, 0.14, 0.26]  # open water renders as a plain deep-blue fill

    slope = slope_from_dem(dem, cell_size_m=10.0)

    # Soil saturation proxy: real rainfall accumulation, modulated so low-lying /
    # low-slope terrain (where water pools and drains slower) reads wetter than
    # steep terrain for the same rainfall total.
    rainfall_factor = np.clip(rainfall.total_mm / 300.0, 0, 1)
    drainage_modulation = 0.2 * (1 - np.clip(slope / 40.0, 0, 1)) - 0.1 * elevation_n
    soil_saturation = np.clip(0.15 + 0.65 * rainfall_factor + drainage_modulation, 0, 1)
    soil_saturation[water_mask] = 1.0

    return RasterStack(
        sar_vv=vv.astype(np.float32),
        sar_vh=vh.astype(np.float32),
        dem=dem,
        baseline_optical=baseline.astype(np.float32),
        soil_saturation=soil_saturation.astype(np.float32),
        slope_deg=slope.astype(np.float32),
        water_mask=water_mask,
        rainfall=rainfall,
        elevation_source=elevation_source,
        sar_source=sar_source,
    )


def _resample(arr: np.ndarray, size: int) -> np.ndarray:
    if arr.shape == (size, size):
        return arr
    row_idx = np.linspace(0, arr.shape[0] - 1, size).astype(int)
    col_idx = np.linspace(0, arr.shape[1] - 1, size).astype(int)
    return arr[np.ix_(row_idx, col_idx)]


def _cloud_mask(size: int, rng: np.random.Generator) -> np.ndarray:
    mask = np.zeros((size, size), dtype=np.float32)
    n_blobs = rng.integers(3, 7)
    yy, xx = np.mgrid[0:size, 0:size]
    for _ in range(n_blobs):
        cy, cx = rng.integers(0, size, size=2)
        radius = rng.uniform(size * 0.08, size * 0.25)
        blob = np.exp(-(((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * radius**2)))
        mask = np.maximum(mask, blob)
    return np.clip(mask, 0, 1)


def write_synthesized_geotiff(
    image: np.ndarray, bbox: BBox, request_id: str
) -> dict:
    """Persist the synthesized pseudo-optical image to `data/processed`.

    Writes a real GeoTIFF when rasterio is available; otherwise a `.npy` +
    JSON sidecar containing equivalent georeferencing metadata.
    """
    settings = get_settings()
    settings.DATA_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    height, width = image.shape[0], image.shape[1]
    bbox_tuple = (bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    resolution_m = haversine_resolution(bbox, width, height)

    try:
        import rasterio
        from rasterio.transform import from_bounds

        filename = f"synthesized_{request_id}.tif"
        out_path = settings.DATA_PROCESSED_DIR / filename
        transform = from_bounds(*bbox_tuple, width, height)
        data = np.transpose((image * 255).astype("uint8"), (2, 0, 1))
        with rasterio.open(
            out_path,
            "w",
            driver="GTiff",
            height=height,
            width=width,
            count=data.shape[0],
            dtype=data.dtype,
            crs="EPSG:4326",
            transform=transform,
        ) as dst:
            dst.write(data)
        driver = "GTiff"
    except Exception:
        filename = f"synthesized_{request_id}.npy"
        out_path = settings.DATA_PROCESSED_DIR / filename
        np.save(out_path, image)
        sidecar = out_path.with_suffix(".json")
        sidecar.write_text(
            json.dumps({"bbox": bbox_tuple, "width": width, "height": height})
        )
        driver = "NPY+JSON"

    return {
        "filename": filename,
        "driver": driver,
        "width": width,
        "height": height,
        "band_count": 3,
        "crs": "EPSG:4326",
        "bbox": bbox_tuple,
        "resolution_m": resolution_m,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def haversine_resolution(bbox: BBox, width: int, height: int) -> float:
    from app.core.gis_utils import haversine_km

    width_km = haversine_km(bbox.min_lat, bbox.min_lon, bbox.min_lat, bbox.max_lon)
    return round((width_km * 1000) / max(width, 1), 2)
