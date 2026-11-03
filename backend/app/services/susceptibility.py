"""Physically-grounded landslide susceptibility scoring.

Replaces "run an untrained neural net and call its output a hazard score"
with a transparent weighted-overlay model — the same class of method used in
real operational susceptibility zonation (e.g. the Geological Survey of
India's macro-scale Landslide Hazard Zonation approach, or the
Mora-Vahrson / Anbalagan methods): a small number of physically meaningful
factors, each normalized to [0, 1], combined with documented fixed weights.

This is NOT a trained, calibrated, or field-validated model. It is a
defensible research-grade heuristic built entirely from real measured inputs
(real elevation, real rainfall) rather than synthetic ones. Operational use
by a disaster management authority would require local calibration against
a historical landslide inventory and expert geotechnical review — this
module makes that gap explicit rather than papering over it with a
neural network that was never trained to close it.

Factor weights:
    slope     0.45  - dominant static susceptibility factor in most
                       zonation schemes; failure likelihood rises sharply
                       past ~30-40 degrees.
    rainfall  0.40  - primary trigger in monsoon-driven settings; recent
                       accumulated precipitation over the request window.
    relief    0.15  - local terrain ruggedness (elevation std-dev in a small
                       neighborhood), a proxy for dissection/slope-length.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import uniform_filter

from app.services.real_data import REFERENCE_EXTREME_RAINFALL_MM

WEIGHTS = {"slope": 0.45, "rainfall": 0.40, "relief": 0.15}
CRITICAL_SLOPE_DEG = 40.0
RELIEF_WINDOW_PX = 5
REFERENCE_RELIEF_M = 60.0


@dataclass
class SusceptibilityResult:
    hazard_index: np.ndarray  # HxW, in [0, 1], 0 over water
    slope_factor: np.ndarray
    rainfall_factor: float
    relief_factor: np.ndarray


def _local_relief(elevation_m: np.ndarray, window: int = RELIEF_WINDOW_PX) -> np.ndarray:
    """Local elevation std-dev (terrain ruggedness) via a fast box-filter identity:
    Var(X) = E[X^2] - E[X]^2, computed with uniform (box) filters."""
    mean = uniform_filter(elevation_m, size=window, mode="nearest")
    mean_sq = uniform_filter(elevation_m**2, size=window, mode="nearest")
    variance = np.clip(mean_sq - mean**2, 0, None)
    return np.sqrt(variance)


def compute_susceptibility(
    slope_deg: np.ndarray,
    elevation_m: np.ndarray,
    water_mask: np.ndarray,
    rainfall_total_mm: float,
) -> SusceptibilityResult:
    slope_factor = np.clip(slope_deg / CRITICAL_SLOPE_DEG, 0, 1)
    rainfall_factor = float(np.clip(rainfall_total_mm / REFERENCE_EXTREME_RAINFALL_MM, 0, 1))
    relief_factor = np.clip(_local_relief(elevation_m) / REFERENCE_RELIEF_M, 0, 1)

    hazard = (
        WEIGHTS["slope"] * slope_factor
        + WEIGHTS["rainfall"] * rainfall_factor
        + WEIGHTS["relief"] * relief_factor
    )
    hazard = np.clip(hazard, 0, 1).astype(np.float32)
    hazard[water_mask] = 0.0

    return SusceptibilityResult(
        hazard_index=hazard,
        slope_factor=slope_factor.astype(np.float32),
        rainfall_factor=rainfall_factor,
        relief_factor=relief_factor.astype(np.float32),
    )
