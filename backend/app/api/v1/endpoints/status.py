"""System / model status endpoint for the dashboard top bar."""
from __future__ import annotations

import random
from datetime import date

from fastapi import APIRouter

from app.models.sar_diffusion import TORCH_AVAILABLE
from app.schemas.hazard import ModelStatus
from app.services.inference_engine import get_last_inference_ms, model_runtime_flags

router = APIRouter()

_SATELLITE_PASSES = ["Sentinel-1A", "Sentinel-1B", "Sentinel-2A", "Sentinel-2B"]


def _monsoon_level_for_today() -> str:
    month = date.today().month
    if month in (6, 7, 8):
        return "Heavy"
    if month in (5, 9):
        return "Moderate"
    if month in (10, 11):
        return "Retreating"
    return "Dry"


def _device_label() -> str:
    if not TORCH_AVAILABLE:
        return "cpu (mock)"
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:  # pragma: no cover
        return "cpu (mock)"


@router.get("/status", response_model=ModelStatus, summary="Live model + satellite status for the top bar.")
def get_status() -> ModelStatus:
    flags = model_runtime_flags()
    return ModelStatus(
        status="Operational",
        model_loaded=True,
        device=_device_label(),
        torch_available=flags["torch_available"],
        diffusers_available=flags["diffusers_available"],
        rasterio_available=flags["rasterio_available"],
        active_satellite_pass=random.choice(_SATELLITE_PASSES),
        monsoon_level=_monsoon_level_for_today(),
        last_inference_ms=get_last_inference_ms(),
    )
