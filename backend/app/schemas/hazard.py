"""Pydantic request/response models for the hazard prediction API."""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class Polarization(str, Enum):
    VV = "VV"
    VH = "VH"
    DUAL = "VV+VH"


class BoundingBox(BaseModel):
    min_lon: float = Field(..., ge=-180, le=180)
    min_lat: float = Field(..., ge=-90, le=90)
    max_lon: float = Field(..., ge=-180, le=180)
    max_lat: float = Field(..., ge=-90, le=90)

    @field_validator("max_lon")
    @classmethod
    def _lon_order(cls, v, info):
        min_lon = info.data.get("min_lon")
        if min_lon is not None and v <= min_lon:
            raise ValueError("max_lon must be greater than min_lon")
        return v

    @field_validator("max_lat")
    @classmethod
    def _lat_order(cls, v, info):
        min_lat = info.data.get("min_lat")
        if min_lat is not None and v <= min_lat:
            raise ValueError("max_lat must be greater than min_lat")
        return v


class LandslidePredictionRequest(BaseModel):
    zone: Optional[str] = Field(
        default=None, description="Named panchayat/district, e.g. 'wayanad' or 'idukki'."
    )
    bbox: Optional[BoundingBox] = Field(
        default=None, description="Explicit bounding box; overrides `zone` if provided."
    )
    start_date: date = Field(..., description="Start of the observation window.")
    end_date: date = Field(..., description="End of the observation window.")
    polarization: Polarization = Field(default=Polarization.DUAL)
    diffusion_steps: int = Field(default=25, ge=5, le=100)

    @field_validator("end_date")
    @classmethod
    def _date_order(cls, v, info):
        start = info.data.get("start_date")
        if start is not None and v < start:
            raise ValueError("end_date must not be before start_date")
        return v


class GeoTiffMeta(BaseModel):
    filename: str
    driver: str = "GTiff"
    width: int
    height: int
    band_count: int
    crs: str
    bbox: BoundingBox
    resolution_m: float
    generated_at: str


class HazardGridCell(BaseModel):
    row: int
    col: int
    lon: float
    lat: float
    hazard_index: float = Field(..., ge=0, le=1)
    is_water: bool
    slope_deg: float
    soil_saturation_pct: float


class DataSources(BaseModel):
    """Provenance for every input the hazard score is actually computed from.

    Surfaced to the client so real vs. fallback data is never ambiguous -
    a `-fallback`/`fallback-*` value means the live source was unreachable
    for this request, not that the result should be trusted the same way.
    """

    elevation: str
    rainfall: str
    water_mask: str = "global-land-mask (GSHHG coastline, offline)"
    sar: str


class LandslidePredictionResponse(BaseModel):
    request_id: str
    zone: str
    bbox: BoundingBox
    start_date: date
    end_date: date
    polarization: Polarization
    diffusion_steps: int
    mean_hazard_index: float
    max_hazard_index: float
    risk_level: str
    is_water_dominant: bool
    estimated_affected_population: int
    soil_moisture_index: float
    rainfall_total_mm: float
    data_sources: DataSources
    synthesized_geotiff: GeoTiffMeta
    hazard_heatmap: List[HazardGridCell]
    hazard_geojson: dict
    model_mode: str
    inference_ms: float


class TimeSeriesPoint(BaseModel):
    date: date
    risk_score: float
    soil_moisture_pct: float
    rainfall_mm: float


class TimeSeriesResponse(BaseModel):
    zone: str
    season: str
    points: List[TimeSeriesPoint]


class ModelStatus(BaseModel):
    status: str
    model_loaded: bool
    device: str
    torch_available: bool
    diffusers_available: bool
    rasterio_available: bool
    active_satellite_pass: str
    monsoon_level: str
    last_inference_ms: Optional[float] = None


class AdvisoryRequest(BaseModel):
    zone: str
    risk_level: str
    mean_hazard_index: float
    estimated_affected_population: int
    issued_by: str = "Kerala State Disaster Management Authority (Simulated)"
