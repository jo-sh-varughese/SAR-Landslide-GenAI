"""
Stand-in for the VAE that Latent Diffusion Models (Rombach et al., 2022,
"High-Resolution Image Synthesis with Latent Diffusion Models") use for
*perceptual compression* before diffusion ever runs.

WHAT REAL STABLE DIFFUSION DOES
--------------------------------
A convolutional encoder E, trained with a KL-regularized autoencoding
objective (+ a patch-based adversarial/perceptual loss), maps a
512x512x3 RGB image to a 64x64x4 latent — an 8x spatial downsample per
axis, ~48x fewer scalars. Diffusion then runs entirely inside that
64x64x4 latent space (this is *why* Stable Diffusion is fast enough to
run on consumer GPUs: the UNet never touches full-resolution pixels).
A decoder D is trained to invert E back to pixels.

WHAT THIS MODULE DOES INSTEAD
------------------------------
E and D above are learned, non-linear, and require a trained model we
don't have here. This module replaces them with a *fixed, linear,
untrained* stand-in — box-filter downsampling for "encode" and bicubic
upsampling for "decode" — at the same 8x spatial factor real SD uses.
It reproduces the *shape* of the pipeline (compress -> diffuse in a
small space -> decompress) and the lossy, blocky character of a small
latent grid, but NOT the learned semantic compression that lets a real
VAE preserve fine detail at 8x. Every place this matters is called out
in the API response so the frontend can label it honestly.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

DOWNSAMPLE_FACTOR = 8


def encode(image: np.ndarray) -> np.ndarray:
    """Box-filter downsample by DOWNSAMPLE_FACTOR. image: (H,W,3) float32 in [-1,1]."""
    h, w, c = image.shape
    lh, lw = h // DOWNSAMPLE_FACTOR, w // DOWNSAMPLE_FACTOR
    cropped = image[: lh * DOWNSAMPLE_FACTOR, : lw * DOWNSAMPLE_FACTOR]
    latent = cropped.reshape(lh, DOWNSAMPLE_FACTOR, lw, DOWNSAMPLE_FACTOR, c).mean(axis=(1, 3))
    return latent.astype(np.float32)


def decode(latent: np.ndarray, out_size: tuple[int, int]) -> np.ndarray:
    """Bicubic upsample latent back to pixel space. Returns (H,W,3) float32 in [-1,1]."""
    arr = np.clip((latent + 1.0) * 127.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="RGB").resize(
        (out_size[1], out_size[0]), resample=Image.BICUBIC
    )
    out = np.asarray(img).astype(np.float32) / 127.5 - 1.0
    return out


def latent_to_thumbnail_rgb(latent: np.ndarray) -> np.ndarray:
    """Nearest-neighbor upscale of the raw latent grid for display — deliberately
    blocky, so the viewer *sees* they're looking at a small compressed grid
    rather than a smoothed image."""
    arr = np.clip((latent + 1.0) * 127.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="RGB")
    scale = 6
    return np.asarray(
        img.resize((img.width * scale, img.height * scale), resample=Image.NEAREST)
    )
