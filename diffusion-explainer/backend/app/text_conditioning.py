"""
Stand-in for text conditioning: in real Stable Diffusion, a frozen CLIP (or
T5) text encoder turns a prompt into a sequence of token embeddings, which
the UNet's cross-attention layers use as Key/Value at every resolution
(Rombach et al. 2022, Fig. 3) so the denoising direction at each pixel is a
function of which prompt tokens it attends to.

We don't have a trained text encoder or cross-attention UNet here, so this
module produces a *deterministic, seeded* pseudo-embedding from the prompt
string — same prompt always yields the same vector, different prompts yield
different (roughly orthogonal, by hashing) vectors — and turns it into a
low-frequency spatial "bias field" that nudges the simulated denoiser
(see diffusion.py) toward prompt-dependent structure. This is a legible
proxy for "conditioning changes the predicted noise," not a claim that
hashing is what CLIP does.
"""
from __future__ import annotations

import hashlib

import numpy as np

EMBED_DIM = 8


def embed_prompt(prompt: str) -> np.ndarray:
    """Deterministic pseudo-embedding in [-1, 1]^EMBED_DIM."""
    prompt = (prompt or "").strip().lower()
    if not prompt:
        return np.zeros(EMBED_DIM, dtype=np.float32)
    digest = hashlib.sha256(prompt.encode("utf-8")).digest()
    raw = np.frombuffer(digest[: EMBED_DIM * 4], dtype=np.uint32).astype(np.float64)
    vec = (raw / np.iinfo(np.uint32).max) * 2.0 - 1.0
    norm = np.linalg.norm(vec)
    return (vec / norm if norm > 0 else vec).astype(np.float32)


def bias_field(embedding: np.ndarray, shape: tuple[int, int, int]) -> np.ndarray:
    """Turn the embedding into a smooth (H,W,3) field in roughly [-1, 1] that
    the reverse process can use to steer the *conditional* noise estimate
    away from the *unconditional* one — the quantity classifier-free
    guidance amplifies. Low-frequency by construction (few sinusoids), which
    mirrors how strongly a real prompt affects coarse structure/color more
    than pixel-level texture."""
    h, w, c = shape
    yy, xx = np.meshgrid(
        np.linspace(0, np.pi, h, dtype=np.float32),
        np.linspace(0, np.pi, w, dtype=np.float32),
        indexing="ij",
    )
    field = np.zeros(shape, dtype=np.float32)
    e = embedding
    for ch in range(c):
        a, b, f = e[ch % len(e)], e[(ch + 3) % len(e)], 1 + abs(e[(ch + 5) % len(e)]) * 3
        field[:, :, ch] = a * np.sin(f * yy) + b * np.cos(f * xx)
    m = np.abs(field).max()
    return field / m if m > 0 else field
