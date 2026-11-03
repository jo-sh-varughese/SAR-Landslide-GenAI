"""Landslide/flood hazard prediction endpoints."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.core.security import verify_api_key
from app.schemas.hazard import (
    AdvisoryRequest,
    LandslidePredictionRequest,
    LandslidePredictionResponse,
    TimeSeriesResponse,
    TimeSeriesPoint,
)
from app.services.inference_engine import run_landslide_prediction
from app.services.pdf_report import generate_advisory_pdf
from app.services.tasks import run_prediction_task

router = APIRouter()


@router.post(
    "/predict/landslide",
    response_model=LandslidePredictionResponse,
    summary="Run SAR-conditioned synthesis + hazard scoring for a bounding box / zone.",
    dependencies=[Depends(verify_api_key)],
)
def predict_landslide(request: LandslidePredictionRequest) -> LandslidePredictionResponse:
    try:
        return run_landslide_prediction(request)
    except Exception as exc:  # pragma: no cover - defensive top-level guard
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc


@router.post(
    "/predict/landslide/async",
    summary="Queue SAR-conditioned inference as a Celery background task; returns a task_id to poll.",
    dependencies=[Depends(verify_api_key)],
)
def predict_landslide_async(request: LandslidePredictionRequest) -> dict:
    task = run_prediction_task.delay(request.model_dump(mode="json"))
    return {"task_id": task.id, "status": "queued"}


@router.get(
    "/predict/task/{task_id}",
    summary="Poll the status/result of an async landslide prediction task.",
)
def get_prediction_task(task_id: str) -> dict:
    result = run_prediction_task.AsyncResult(task_id)
    body = {"task_id": task_id, "status": result.status}
    if result.successful():
        body["result"] = result.result
    elif result.failed():
        body["error"] = str(result.result)
    return body


@router.get(
    "/predict/timeseries",
    response_model=TimeSeriesResponse,
    summary="Monsoon-season (May-Sep) risk trend time series for a zone.",
)
def get_timeseries(zone: str = "wayanad") -> TimeSeriesResponse:
    import numpy as np

    rng = np.random.default_rng(abs(hash(zone.lower())) % (2**32))
    year = date.today().year
    start = date(year, 5, 1)
    points = []
    monsoon_peak = 105  # day-of-monsoon offset for peak rainfall (~mid July)
    for offset in range(0, 153, 3):  # May 1 -> Sep 30, every 3 days
        d = start + timedelta(days=offset)
        seasonal = np.exp(-((offset - monsoon_peak) ** 2) / (2 * 35**2))
        noise = rng.normal(0, 0.05)
        risk = float(np.clip(0.15 + 0.65 * seasonal + noise, 0, 1))
        rainfall = float(np.clip(40 + 380 * seasonal + rng.normal(0, 20), 0, None))
        soil_moisture = float(np.clip(30 + 55 * seasonal + rng.normal(0, 4), 0, 100))
        points.append(
            TimeSeriesPoint(
                date=d, risk_score=round(risk, 3), soil_moisture_pct=round(soil_moisture, 1),
                rainfall_mm=round(rainfall, 1),
            )
        )

    return TimeSeriesResponse(zone=zone, season=f"Monsoon {year}", points=points)


@router.post(
    "/predict/advisory-pdf",
    summary="Generate a downloadable citizen advisory alert PDF.",
    dependencies=[Depends(verify_api_key)],
)
def download_advisory_pdf(advisory: AdvisoryRequest) -> Response:
    try:
        pdf_bytes = generate_advisory_pdf(advisory)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    filename = f"advisory_{advisory.zone.lower().replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
