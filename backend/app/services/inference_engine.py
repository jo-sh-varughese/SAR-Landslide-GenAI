"""Orchestrates real-data hazard scoring + illustrative SAR-to-optical synthesis.

This is the single entry point the `/predict/landslide` endpoint calls. The
hazard number comes entirely from `susceptibility.py`'s weighted-overlay
model over real elevation/slope/rainfall/water-mask data (see that module's
docstring for the method and its limitations). The conditional latent
diffusion model still runs to produce the pseudo-optical "AI-Synthesized"
image used in the map's swipe-compare view, but — because its weights are
randomly initialized, not trained — its output no longer feeds the hazard
score at all; it is presented to the user purely as an illustrative
reconstruction, never as evidence.
"""
from __future__ import annotations

import base64
import io
import time
import uuid
from typing import Optional

import numpy as np

from app.core.config import get_settings
from app.core.gis_utils import KERALA_POIS, BBox, bbox_around_point
from app.models.sar_diffusion import SARLatentDiffusion, TORCH_AVAILABLE
from app.schemas.hazard import (
    BoundingBox,
    DataSources,
    GeoTiffMeta,
    HazardGridCell,
    LandslidePredictionRequest,
    LandslidePredictionResponse,
    PreviewImages,
)
from app.services.band_processor import RasterStack, load_raster_stack, write_synthesized_geotiff
from app.services.susceptibility import SusceptibilityResult, compute_susceptibility

_diffusion_model: Optional[SARLatentDiffusion] = None
_last_inference_ms: Optional[float] = None

WATER_DOMINANT_THRESHOLD = 0.6  # fraction of the tile that must be water to call the whole tile N/A


def get_diffusion_model() -> SARLatentDiffusion:
    global _diffusion_model
    if _diffusion_model is None:
        settings = get_settings()
        _diffusion_model = SARLatentDiffusion(image_size=settings.HAZARD_TILE_SIZE)
    return _diffusion_model


def get_last_inference_ms() -> Optional[float]:
    return _last_inference_ms


def resolve_bbox(request: LandslidePredictionRequest) -> BoundingBox:
    if request.bbox is not None:
        return request.bbox
    zone_key = (request.zone or "wayanad").strip().lower()
    poi = KERALA_POIS.get(zone_key, KERALA_POIS["wayanad"])
    box = bbox_around_point(poi["lat"], poi["lon"], half_extent_deg=0.06)
    return BoundingBox(
        min_lon=box.min_lon, min_lat=box.min_lat, max_lon=box.max_lon, max_lat=box.max_lat
    )


def _risk_level(mean_hazard: float, is_water_dominant: bool) -> str:
    if is_water_dominant:
        return "Not Applicable"
    if mean_hazard < 0.25:
        return "Safe"
    if mean_hazard < 0.45:
        return "Watch"
    if mean_hazard < 0.65:
        return "Warning"
    if mean_hazard < 0.8:
        return "Critical"
    return "Severe"


def _stretch(band: np.ndarray, lo_pct: float = 2, hi_pct: float = 98) -> np.ndarray:
    lo, hi = np.percentile(band, lo_pct), np.percentile(band, hi_pct)
    if hi - lo < 1e-6:
        return np.zeros_like(band, dtype=np.float32)
    return np.clip((band - lo) / (hi - lo), 0, 1).astype(np.float32)


def _to_data_uri(rgb: np.ndarray, quality: int = 82) -> str:
    """Encodes an HxWx3 float image in [0, 1] as a JPEG data URI."""
    from PIL import Image

    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _build_preview_images(
    sar_vv: np.ndarray, sar_vh: np.ndarray, baseline_optical: np.ndarray, synthesized: np.ndarray
) -> Optional[PreviewImages]:
    """Standard SAR false-colour composite (R=VV, G=VH, B=VV/VH) plus the cloudy
    baseline and synthesized optical scenes, for display only."""
    try:
        vv, vh = _stretch(sar_vv), _stretch(sar_vh)
        ratio = _stretch(sar_vv - sar_vh)  # dB difference == log ratio
        sar_rgb = np.stack([vv, vh, ratio], axis=-1)
        return PreviewImages(
            sar=_to_data_uri(sar_rgb),
            optical_cloudy=_to_data_uri(baseline_optical),
            optical_synthesized=_to_data_uri(synthesized),
        )
    except Exception:  # pragma: no cover - previews are optional, never fatal
        return None


def _build_hazard_geojson(
    result: SusceptibilityResult,
    water_mask: np.ndarray,
    stack: RasterStack,
    bbox: BoundingBox,
    grid_n: int = 16,
) -> dict:
    h, w = result.hazard_index.shape
    row_edges = np.linspace(bbox.max_lat, bbox.min_lat, grid_n + 1)
    col_edges = np.linspace(bbox.min_lon, bbox.max_lon, grid_n + 1)
    row_idx = np.linspace(0, h - 1, grid_n).astype(int)
    col_idx = np.linspace(0, w - 1, grid_n).astype(int)

    features = []
    for i in range(grid_n):
        for j in range(grid_n):
            r, c = row_idx[i], col_idx[j]
            is_water = bool(water_mask[r, c])
            cell_val = float(result.hazard_index[r, c])
            polygon = [
                [col_edges[j], row_edges[i]],
                [col_edges[j + 1], row_edges[i]],
                [col_edges[j + 1], row_edges[i + 1]],
                [col_edges[j], row_edges[i + 1]],
                [col_edges[j], row_edges[i]],
            ]
            center_lon = (col_edges[j] + col_edges[j + 1]) / 2
            center_lat = (row_edges[i] + row_edges[i + 1]) / 2
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "hazard_index": round(cell_val, 4),
                        "risk_level": "Not Applicable" if is_water else _risk_level(cell_val, False),
                        "is_water": is_water,
                        "slope_deg": round(float(stack.slope_deg[r, c]), 2),
                        "soil_saturation_pct": round(float(stack.soil_saturation[r, c]) * 100, 1),
                        "elevation_m": round(float(stack.dem[r, c]), 1),
                        "center_lon": round(float(center_lon), 5),
                        "center_lat": round(float(center_lat), 5),
                    },
                    "geometry": {"type": "Polygon", "coordinates": [polygon]},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def _build_hazard_grid_cells(
    result: SusceptibilityResult,
    water_mask: np.ndarray,
    stack: RasterStack,
    bbox: BoundingBox,
    grid_n: int = 16,
) -> list[HazardGridCell]:
    h, w = result.hazard_index.shape
    row_idx = np.linspace(0, h - 1, grid_n).astype(int)
    col_idx = np.linspace(0, w - 1, grid_n).astype(int)
    lat_vals = np.linspace(bbox.max_lat, bbox.min_lat, grid_n)
    lon_vals = np.linspace(bbox.min_lon, bbox.max_lon, grid_n)

    cells = []
    for i in range(grid_n):
        for j in range(grid_n):
            r, c = row_idx[i], col_idx[j]
            cells.append(
                HazardGridCell(
                    row=i,
                    col=j,
                    lat=float(lat_vals[i]),
                    lon=float(lon_vals[j]),
                    hazard_index=round(float(result.hazard_index[r, c]), 4),
                    is_water=bool(water_mask[r, c]),
                    slope_deg=round(float(stack.slope_deg[r, c]), 2),
                    soil_saturation_pct=round(float(stack.soil_saturation[r, c]) * 100, 1),
                )
            )
    return cells


def run_landslide_prediction(request: LandslidePredictionRequest) -> LandslidePredictionResponse:
    start = time.perf_counter()
    settings = get_settings()

    bbox = resolve_bbox(request)
    gis_bbox = BBox(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    zone_label = (request.zone or "custom-bbox").strip().lower()

    stack = load_raster_stack(gis_bbox, request.start_date, request.end_date, size=settings.HAZARD_TILE_SIZE)

    susceptibility = compute_susceptibility(
        slope_deg=stack.slope_deg,
        elevation_m=stack.dem,
        water_mask=stack.water_mask,
        rainfall_total_mm=stack.rainfall.total_mm,
    )

    # A single-polarization request only has that one channel of real signal;
    # simulate that by collapsing the unused channel onto the selected one
    # rather than silently ignoring the `polarization` parameter. This feeds
    # only the illustrative image synthesis below, never hazard scoring.
    if request.polarization.value == "VV":
        sar_vv, sar_vh = stack.sar_vv, stack.sar_vv
    elif request.polarization.value == "VH":
        sar_vv, sar_vh = stack.sar_vh, stack.sar_vh
    else:
        sar_vv, sar_vh = stack.sar_vv, stack.sar_vh

    model = get_diffusion_model()
    synthesis = model.synthesize(sar_vv, sar_vh, stack.dem, num_steps=request.diffusion_steps)

    request_id = uuid.uuid4().hex[:12]
    geotiff_meta_dict = write_synthesized_geotiff(synthesis.image, bbox, request_id)
    geotiff_meta = GeoTiffMeta(
        filename=geotiff_meta_dict["filename"],
        driver=geotiff_meta_dict["driver"],
        width=geotiff_meta_dict["width"],
        height=geotiff_meta_dict["height"],
        band_count=geotiff_meta_dict["band_count"],
        crs=geotiff_meta_dict["crs"],
        bbox=bbox,
        resolution_m=geotiff_meta_dict["resolution_m"],
        generated_at=geotiff_meta_dict["generated_at"],
    )

    water_fraction = float(np.mean(stack.water_mask))
    is_water_dominant = water_fraction >= WATER_DOMINANT_THRESHOLD
    land_mask = ~stack.water_mask

    if land_mask.any():
        mean_hazard = float(np.mean(susceptibility.hazard_index[land_mask]))
        max_hazard = float(np.max(susceptibility.hazard_index[land_mask]))
    else:
        mean_hazard = max_hazard = 0.0

    soil_moisture_index = float(np.mean(stack.soil_saturation[land_mask])) if land_mask.any() else 0.0

    area_km2 = _bbox_area_km2(gis_bbox)
    land_area_km2 = area_km2 * (1 - water_fraction)
    # Rough population-exposure estimate: hazard-weighted density proxy scaled
    # by *land* area only, calibrated so a severe full-bbox event over a
    # Western Ghats panchayat lands in the low-thousands range.
    estimated_population = 0 if is_water_dominant else int(mean_hazard * land_area_km2 * 145)

    hazard_geojson = _build_hazard_geojson(susceptibility, stack.water_mask, stack, bbox)
    hazard_cells = _build_hazard_grid_cells(susceptibility, stack.water_mask, stack, bbox)

    elapsed_ms = (time.perf_counter() - start) * 1000
    global _last_inference_ms
    _last_inference_ms = elapsed_ms

    return LandslidePredictionResponse(
        request_id=request_id,
        zone=zone_label,
        bbox=bbox,
        start_date=request.start_date,
        end_date=request.end_date,
        polarization=request.polarization,
        diffusion_steps=request.diffusion_steps,
        mean_hazard_index=round(mean_hazard, 4),
        max_hazard_index=round(max_hazard, 4),
        risk_level=_risk_level(mean_hazard, is_water_dominant),
        is_water_dominant=is_water_dominant,
        estimated_affected_population=estimated_population,
        soil_moisture_index=round(soil_moisture_index, 4),
        rainfall_total_mm=stack.rainfall.total_mm,
        data_sources=DataSources(
            elevation=stack.elevation_source,
            rainfall=stack.rainfall.source,
            sar=stack.sar_source,
        ),
        synthesized_geotiff=geotiff_meta,
        hazard_heatmap=hazard_cells,
        hazard_geojson=hazard_geojson,
        model_mode=synthesis.mode,
        inference_ms=round(elapsed_ms, 2),
        preview_images=_build_preview_images(sar_vv, sar_vh, stack.baseline_optical, synthesis.image),
    )


def _bbox_area_km2(bbox: BBox) -> float:
    from app.core.gis_utils import haversine_km

    width_km = haversine_km(bbox.min_lat, bbox.min_lon, bbox.min_lat, bbox.max_lon)
    height_km = haversine_km(bbox.min_lat, bbox.min_lon, bbox.max_lat, bbox.min_lon)
    return abs(width_km * height_km)


def model_runtime_flags() -> dict:
    try:
        import diffusers  # noqa: F401

        diffusers_available = True
    except ImportError:
        diffusers_available = False

    try:
        import rasterio  # noqa: F401

        rasterio_available = True
    except ImportError:
        rasterio_available = False

    return {
        "torch_available": TORCH_AVAILABLE,
        "diffusers_available": diffusers_available,
        "rasterio_available": rasterio_available,
    }
