from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image, ImageOps


def load_image_to_array(data: bytes, size: int) -> np.ndarray:
    """Decode uploaded bytes, center-crop to square, resize to (size,size),
    return float32 array in [-1, 1]."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 127.5 - 1.0
    return arr


def array_to_png_b64(arr: np.ndarray) -> str:
    """arr: (H,W,3) float32 in [-1,1] -> data URI PNG."""
    clipped = np.clip((arr + 1.0) * 127.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(clipped, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def uint8_array_to_png_b64(arr: np.ndarray) -> str:
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"
