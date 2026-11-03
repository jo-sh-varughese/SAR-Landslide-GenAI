"""Pre-processing utilities: tile raw SAR/optical GeoTIFFs into fixed-size,
band-normalized patches ready for model training/inference.

Run after `scripts/download_datasets.py`:

    python backend/scripts/preprocess.py --tile-size 256
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("Preprocess")

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw"
PROCESSED_DIR = ROOT_DIR / "data" / "processed"


def normalize_band(band: np.ndarray, lo_pct: float = 2, hi_pct: float = 98) -> np.ndarray:
    lo, hi = np.percentile(band, lo_pct), np.percentile(band, hi_pct)
    if hi - lo < 1e-6:
        return np.zeros_like(band, dtype=np.float32)
    return np.clip((band - lo) / (hi - lo), 0, 1).astype(np.float32)


def tile_array(arr: np.ndarray, tile_size: int):
    h, w = arr.shape[-2], arr.shape[-1]
    for y in range(0, h - tile_size + 1, tile_size):
        for x in range(0, w - tile_size + 1, tile_size):
            if arr.ndim == 2:
                yield y, x, arr[y : y + tile_size, x : x + tile_size]
            else:
                yield y, x, arr[:, y : y + tile_size, x : x + tile_size]


def process_geotiff(path: Path, tile_size: int) -> int:
    try:
        import rasterio
    except ImportError:
        logger.warning("rasterio not installed - skipping %s", path.name)
        return 0

    count = 0
    with rasterio.open(path) as src:
        data = src.read().astype(np.float32)
        normalized = np.stack([normalize_band(data[b]) for b in range(data.shape[0])], axis=0)

        out_dir = PROCESSED_DIR / path.stem
        out_dir.mkdir(parents=True, exist_ok=True)

        for y, x, tile in tile_array(normalized, tile_size):
            out_path = out_dir / f"tile_{y}_{x}.npy"
            np.save(out_path, tile)
            count += 1

    logger.info("Processed %s -> %d tile(s) in %s", path.name, count, out_dir)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Tile + normalize raw GeoTIFF rasters.")
    parser.add_argument("--tile-size", type=int, default=256)
    args = parser.parse_args()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    tif_files = sorted(RAW_DIR.rglob("*.tif"))

    if not tif_files:
        logger.warning(
            "No .tif files found under %s. Run scripts/download_datasets.py first.", RAW_DIR
        )
        return

    total_tiles = 0
    for tif_path in tif_files:
        total_tiles += process_geotiff(tif_path, args.tile_size)

    logger.info("Done. %d total tiles written under %s", total_tiles, PROCESSED_DIR)


if __name__ == "__main__":
    main()
