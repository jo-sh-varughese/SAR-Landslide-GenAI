"""Dataset acquisition pipeline for SAR-Landslide-GenAI.

Fetches the three data sources the framework is built around, writes an
auditable manifest, and guarantees `backend/scripts/preprocess.py` and the API
always have real files to work with:

  1. Zenodo Landslide Reference Data   - paired Sentinel-1 / Sentinel-2 samples
     (https://zenodo.org/records/15421843)
  2. GLaD4CD                           - landslide change-detection patches
     (https://zenodo.org/records/14226448)
  3. NASA ASF Sentinel-1 GRD (IW)      - scenes over Idukki and Wayanad, via
     `asf_search`. Granule metadata is always recorded; full granules
     (~1 GB each) are only downloaded with `--download-granules` and
     Earthdata credentials (ASF_USERNAME / ASF_PASSWORD in backend/.env).

If every remote source is unreachable, the script writes clearly-named
synthetic dual-pol (VV/VH) GeoTIFFs (`kerala_synthetic_<site>_VV_VH.tif`) so
the rest of the pipeline still runs. Synthetic files are always labelled as
such, in both the filename and the manifest.

Usage:
    python scripts/download_datasets.py                      # defaults: everything, small samples
    python scripts/download_datasets.py --sources zenodo glad4cd --max-files 5
    python scripts/download_datasets.py --sources asf --download-granules --max-granules 2
    python scripts/download_datasets.py --dry-run            # list what would be fetched
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

ROOT_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT_DIR / "data" / "raw"
MANIFEST_PATH = ROOT_DIR / "data" / "dataset_manifest.json"
BACKEND_ENV = ROOT_DIR / "backend" / ".env"

ZENODO_API = "https://zenodo.org/api/records/{record_id}"
SOURCES = {
    "zenodo": {"record_id": "15421843", "label": "Zenodo Landslide Reference Data", "subdir": "zenodo_landslide"},
    "glad4cd": {"record_id": "14226448", "label": "GLaD4CD change-detection patches", "subdir": "glad4cd"},
}
SITES = {
    "idukki": {"lat": 9.8500, "lon": 76.9667},
    "wayanad": {"lat": 11.6854, "lon": 76.1320},
}
CHUNK = 1 << 20

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("download_datasets")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _load_env(path: Path) -> None:
    """Minimal .env loader so ASF credentials work without exporting them."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _session():
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    s = requests.Session()
    retry = Retry(total=4, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers["User-Agent"] = "SAR-Landslide-GenAI/0.1 (research dataset pipeline)"
    return s


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _verify_checksum(path: Path, checksum: Optional[str]) -> bool:
    """Zenodo checksums look like 'md5:<hex>'."""
    if not checksum or ":" not in checksum:
        return True
    algo, expected = checksum.split(":", 1)
    try:
        h = hashlib.new(algo)
    except ValueError:
        return True
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest() == expected


def _stream_download(session, url: str, dest: Path, expected_size: Optional[int] = None) -> int:
    """Resumable streaming download to `dest` via a `.part` file."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    offset = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}

    with session.get(url, stream=True, timeout=60, headers=headers) as resp:
        if resp.status_code == 416:  # already complete
            part.rename(dest)
            return dest.stat().st_size
        resp.raise_for_status()
        mode = "ab" if resp.status_code == 206 else "wb"
        total = expected_size or int(resp.headers.get("Content-Length", 0)) + (offset if mode == "ab" else 0)
        written = offset if mode == "ab" else 0
        last_pct = -10
        with part.open(mode) as fh:
            for chunk in resp.iter_content(CHUNK):
                fh.write(chunk)
                written += len(chunk)
                if total:
                    pct = int(written * 100 / total)
                    if pct >= last_pct + 10:
                        log.info("    %3d%%  %s / %s", pct, _human(written), _human(total))
                        last_pct = pct
    part.replace(dest)
    return written


# --------------------------------------------------------------------------- #
# Zenodo (landslide reference data + GLaD4CD)
# --------------------------------------------------------------------------- #
@dataclass
class SourceReport:
    url: str
    files_downloaded: int = 0
    files_skipped: int = 0
    bytes_downloaded: int = 0
    files: list = field(default_factory=list)
    error: Optional[str] = None


def fetch_zenodo(key: str, max_files: int, max_file_mb: float, dry_run: bool) -> SourceReport:
    cfg = SOURCES[key]
    record_url = f"https://zenodo.org/records/{cfg['record_id']}"
    report = SourceReport(url=record_url)
    log.info("[%s] querying %s", key, record_url)

    try:
        session = _session()
        meta = session.get(ZENODO_API.format(record_id=cfg["record_id"]), timeout=30).json()
    except Exception as exc:
        report.error = f"record lookup failed: {exc}"
        log.warning("[%s] %s", key, report.error)
        return report

    files = sorted(meta.get("files", []), key=lambda f: f.get("size", 0))
    log.info("[%s] %d file(s) in record '%s'", key, len(files), meta.get("metadata", {}).get("title", "?"))
    out_dir = RAW_DIR / cfg["subdir"]

    for entry in files:
        if report.files_downloaded >= max_files:
            break
        name, size = entry.get("key"), int(entry.get("size", 0))
        url = entry.get("links", {}).get("self")
        if not name or not url:
            continue
        if size > max_file_mb * 1024 * 1024:
            log.info("[%s] skip %s (%s > --max-file-mb %.0f)", key, name, _human(size), max_file_mb)
            report.files_skipped += 1
            continue

        dest = out_dir / name
        record = {"name": name, "size": size, "checksum": entry.get("checksum"), "path": str(dest.relative_to(ROOT_DIR))}
        if dry_run:
            log.info("[%s] would download %s (%s)", key, name, _human(size))
            report.files.append(record)
            continue
        if dest.exists() and dest.stat().st_size == size and _verify_checksum(dest, entry.get("checksum")):
            log.info("[%s] up to date: %s", key, name)
            report.files.append(record)
            report.files_downloaded += 1
            continue

        try:
            log.info("[%s] downloading %s (%s)", key, name, _human(size))
            report.bytes_downloaded += _stream_download(session, url, dest, size)
            if not _verify_checksum(dest, entry.get("checksum")):
                dest.unlink(missing_ok=True)
                raise IOError("checksum mismatch")
            report.files.append(record)
            report.files_downloaded += 1
        except Exception as exc:
            log.warning("[%s] failed %s: %s", key, name, exc)
            report.error = str(exc)

    return report


# --------------------------------------------------------------------------- #
# NASA ASF Sentinel-1
# --------------------------------------------------------------------------- #
def fetch_asf(
    start: date, end: date, max_granules: int, download: bool, dry_run: bool
) -> dict:
    report: dict = {"sites": list(SITES), "granules_found": 0, "granules_downloaded": 0, "granules": []}
    try:
        import asf_search as asf
    except ImportError:
        report["error"] = "asf_search not installed (pip install -r backend/requirements.txt)"
        log.warning("[asf] %s", report["error"])
        return report

    session = None
    if download and not dry_run:
        user, pwd = os.environ.get("ASF_USERNAME"), os.environ.get("ASF_PASSWORD")
        if user and pwd:
            try:
                session = asf.ASFSession().auth_with_creds(user, pwd)
            except Exception as exc:
                log.warning("[asf] Earthdata authentication failed: %s", exc)
        else:
            log.warning("[asf] --download-granules needs ASF_USERNAME / ASF_PASSWORD in backend/.env; metadata only")

    for site, pt in SITES.items():
        wkt = f"POINT({pt['lon']} {pt['lat']})"
        try:
            results = asf.geo_search(
                platform=[asf.PLATFORM.SENTINEL1],
                processingLevel=asf.PRODUCT_TYPE.GRD_HD,
                beamMode=asf.BEAMMODE.IW,
                intersectsWith=wkt,
                start=start.isoformat(),
                end=end.isoformat(),
                maxResults=max_granules,
            )
        except Exception as exc:
            report.setdefault("errors", {})[site] = str(exc)
            log.warning("[asf] %s search failed: %s", site, exc)
            continue

        log.info("[asf] %s: %d granule(s) %s..%s", site, len(results), start, end)
        report["granules_found"] += len(results)
        out_dir = RAW_DIR / "asf_sentinel1" / site
        for product in results:
            props = product.properties
            report["granules"].append(
                {
                    "site": site,
                    "scene": props.get("sceneName"),
                    "start_time": props.get("startTime"),
                    "orbit_direction": props.get("flightDirection"),
                    "polarization": props.get("polarization"),
                    "size_mb": props.get("bytes", 0) / 1e6 if props.get("bytes") else None,
                    "url": props.get("url"),
                }
            )
            if session is not None:
                try:
                    out_dir.mkdir(parents=True, exist_ok=True)
                    product.download(path=str(out_dir), session=session)
                    report["granules_downloaded"] += 1
                except Exception as exc:
                    log.warning("[asf] download failed for %s: %s", props.get("sceneName"), exc)
    return report


# --------------------------------------------------------------------------- #
# Synthetic fallback
# --------------------------------------------------------------------------- #
def write_synthetic_tiles(size: int = 512) -> list[str]:
    """Dual-pol (VV, VH) dB-scale GeoTIFFs whose texture follows a fractal
    terrain surface. Named `kerala_synthetic_*` so they are never mistaken
    for real acquisitions; matched by the API's `*VV*.tif` raw-tile lookup."""
    try:
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds
    except ImportError:
        log.warning("[synthetic] numpy/rasterio not installed - skipping")
        return []

    written = []
    for site, pt in SITES.items():
        dest = RAW_DIR / f"kerala_synthetic_{site}_VV_VH.tif"
        if dest.exists():
            log.info("[synthetic] exists: %s", dest.name)
            written.append(str(dest.relative_to(ROOT_DIR)))
            continue

        rng = np.random.default_rng(int(hashlib.sha256(site.encode()).hexdigest()[:8], 16))
        # 1/f spectral synthesis -> realistic-looking ridge/valley terrain.
        fy, fx = np.meshgrid(np.fft.fftfreq(size), np.fft.fftfreq(size), indexing="ij")
        freq = np.sqrt(fx**2 + fy**2)
        freq[0, 0] = 1.0
        spectrum = (rng.normal(size=(size, size)) + 1j * rng.normal(size=(size, size))) / freq**1.6
        terrain = np.real(np.fft.ifft2(spectrum))
        terrain = (terrain - terrain.min()) / (np.ptp(terrain) + 1e-9)
        gy, gx = np.gradient(terrain)
        rough = np.clip(np.hypot(gx, gy) / (np.hypot(gx, gy).max() + 1e-9), 0, 1)

        speckle = rng.gamma(4.0, 0.25, size=(2, size, size))  # 4-look multiplicative speckle
        vv = -20 + 13 * rough + 10 * np.log10(speckle[0])
        vh = -26 + 11 * rough + 10 * np.log10(speckle[1])

        half = 0.06
        transform = from_bounds(pt["lon"] - half, pt["lat"] - half, pt["lon"] + half, pt["lat"] + half, size, size)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(
            dest, "w", driver="GTiff", width=size, height=size, count=2, dtype="float32",
            crs="EPSG:4326", transform=transform, compress="deflate",
        ) as dst:
            dst.write(np.stack([vv, vh]).astype("float32"))
            dst.set_band_description(1, "VV (dB, synthetic)")
            dst.set_band_description(2, "VH (dB, synthetic)")
            dst.update_tags(SOURCE="synthetic-fallback", SITE=site)
        log.info("[synthetic] wrote %s", dest.name)
        written.append(str(dest.relative_to(ROOT_DIR)))
    return written


# --------------------------------------------------------------------------- #
def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sources", nargs="+", default=["zenodo", "glad4cd", "asf", "synthetic"],
                   choices=["zenodo", "glad4cd", "asf", "synthetic"])
    p.add_argument("--max-files", type=int, default=3, help="max files per Zenodo record (default 3)")
    p.add_argument("--max-file-mb", type=float, default=500, help="skip Zenodo files larger than this")
    p.add_argument("--start", type=date.fromisoformat, default=date(2024, 6, 1), help="ASF search start (YYYY-MM-DD)")
    p.add_argument("--end", type=date.fromisoformat, default=date(2024, 9, 30), help="ASF search end (YYYY-MM-DD)")
    p.add_argument("--max-granules", type=int, default=5, help="ASF granules per site")
    p.add_argument("--download-granules", action="store_true", help="download full ASF granules (~1 GB each)")
    p.add_argument("--force-synthetic", action="store_true", help="write synthetic tiles even if real data arrived")
    p.add_argument("--dry-run", action="store_true", help="list what would be fetched; write nothing")
    return p.parse_args(argv)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    _load_env(BACKEND_ENV)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "dry_run": args.dry_run}
    real_files = 0

    for key in ("zenodo", "glad4cd"):
        if key in args.sources:
            rep = fetch_zenodo(key, args.max_files, args.max_file_mb, args.dry_run)
            manifest_key = "zenodo_landslide_reference" if key == "zenodo" else "glad4cd"
            manifest[manifest_key] = rep.__dict__
            real_files += rep.files_downloaded

    if "asf" in args.sources:
        rep = fetch_asf(args.start, args.end, args.max_granules, args.download_granules, args.dry_run)
        manifest["asf_sentinel1_western_ghats"] = rep
        real_files += rep.get("granules_downloaded", 0)

    if "synthetic" in args.sources and not args.dry_run and (real_files == 0 or args.force_synthetic):
        if real_files == 0:
            log.info("[synthetic] no real rasters acquired - writing labelled synthetic fallback tiles")
        manifest["synthetic_fallback"] = {"files": write_synthetic_tiles()}

    if not args.dry_run:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
        log.info("manifest -> %s", MANIFEST_PATH.relative_to(ROOT_DIR))
    log.info("done. next: python backend/scripts/preprocess.py --tile-size 256")
    return 0


if __name__ == "__main__":
    sys.exit(main())
