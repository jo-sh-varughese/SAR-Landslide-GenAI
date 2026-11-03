"""Celery task wrapping the (potentially slow) diffusion inference pipeline.

Enables the `/predict/landslide/async` endpoint to hand off inference to a
background worker when a Redis broker is available. In local dev, Celery's
`task_always_eager` setting (see app/core/celery_app.py) runs this inline so
no separate worker process is required to demo the flow.
"""
from __future__ import annotations

from app.core.celery_app import celery_app
from app.schemas.hazard import LandslidePredictionRequest
from app.services.inference_engine import run_landslide_prediction


@celery_app.task(name="sar_landslide_genai.run_prediction")
def run_prediction_task(payload: dict) -> dict:
    request = LandslidePredictionRequest(**payload)
    result = run_landslide_prediction(request)
    return result.model_dump(mode="json")
