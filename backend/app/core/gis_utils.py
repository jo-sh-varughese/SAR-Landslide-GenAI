"""GIS helper utilities shared across services and endpoints.

Kept dependency-light: numpy is required, but rasterio/pyproj are imported
lazily so the API can boot and serve mock responses even before the full
GIS stack has finished installing.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

import numpy as np

# Named Western Ghats (Kerala) points of interest used across the app.
KERALA_POIS = {
    "idukki": {"lat": 9.8500, "lon": 76.9667, "label": "Idukki"},
    "wayanad": {"lat": 11.6854, "lon": 76.1320, "label": "Wayanad"},
}


@dataclass
class BBox:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def as_tuple(self) -> Tuple[float, float, float, float]:
        return (self.min_lon, self.min_lat, self.max_lon, self.max_lat)

    def center(self) -> Tuple[float, float]:
        return (
            (self.min_lon + self.max_lon) / 2,
            (self.min_lat + self.max_lat) / 2,
        )

    def to_wkt(self) -> str:
        return (
            f"POLYGON(({self.min_lon} {self.min_lat}, {self.max_lon} {self.min_lat}, "
            f"{self.max_lon} {self.max_lat}, {self.min_lon} {self.max_lat}, "
            f"{self.min_lon} {self.min_lat}))"
        )


def bbox_around_point(lat: float, lon: float, half_extent_deg: float = 0.05) -> BBox:
    return BBox(
        min_lon=lon - half_extent_deg,
        min_lat=lat - half_extent_deg,
        max_lon=lon + half_extent_deg,
        max_lat=lat + half_extent_deg,
    )


def slope_from_dem(dem: np.ndarray, cell_size_m: float = 10.0) -> np.ndarray:
    """Compute a slope-angle raster (degrees) from a DEM using a Sobel-style gradient."""
    gy, gx = np.gradient(dem.astype(np.float32), cell_size_m)
    slope_rad = np.arctan(np.sqrt(gx**2 + gy**2))
    return np.degrees(slope_rad)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def try_import_rasterio():
    try:
        import rasterio  # noqa: F401

        return rasterio
    except ImportError:
        return None
