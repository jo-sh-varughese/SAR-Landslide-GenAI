"""
Variance (noise) schedules for Gaussian diffusion.

Both schedules below are the exact formulas from the literature, not
approximations:

- linear:  Ho, Jain & Abbeel, "Denoising Diffusion Probabilistic Models"
  (2020), Sec. 4 — beta_t interpolated linearly from beta_1 to beta_T.
- cosine:  Nichol & Dhariwal, "Improved Denoising Diffusion Probabilistic
  Models" (2021), Sec. 3.2, eq. 17 — alpha_bar_t follows a cosine curve so
  information is destroyed more gradually near t=0, which they found
  improves sample quality over the linear schedule.

All downstream math (forward process, posterior mean/variance, DDIM step)
depends only on the arrays this module produces (betas, alphas, alpha_bar),
so swapping schedules here changes the entire diffusion trajectory.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def linear_beta_schedule(
    timesteps: int, beta_start: float = 1e-4, beta_end: float = 2e-2
) -> np.ndarray:
    return np.linspace(beta_start, beta_end, timesteps, dtype=np.float64)


def cosine_beta_schedule(timesteps: int, s: float = 0.008) -> np.ndarray:
    steps = timesteps + 1
    t = np.linspace(0, timesteps, steps, dtype=np.float64) / timesteps
    alphas_bar = np.cos((t + s) / (1 + s) * np.pi / 2) ** 2
    alphas_bar = alphas_bar / alphas_bar[0]
    betas = 1.0 - (alphas_bar[1:] / alphas_bar[:-1])
    return np.clip(betas, 1e-8, 0.999)


@dataclass
class NoiseSchedule:
    """Precomputes every quantity the forward/reverse process needs.

    Index convention: arrays are 0-indexed over "diffusion time" t = 0..T-1,
    where t=0 is the *least* noisy step and t=T-1 is (near) pure noise —
    matching how the frontend timeline scrubs from clean to noisy to clean
    again.
    """

    timesteps: int
    kind: str = "cosine"

    def __post_init__(self) -> None:
        if self.kind == "cosine":
            betas = cosine_beta_schedule(self.timesteps)
        elif self.kind == "linear":
            betas = linear_beta_schedule(self.timesteps)
        else:
            raise ValueError(f"unknown schedule kind: {self.kind!r}")

        alphas = 1.0 - betas
        alphas_bar = np.cumprod(alphas)
        alphas_bar_prev = np.concatenate([[1.0], alphas_bar[:-1]])

        self.betas = betas
        self.alphas = alphas
        self.alphas_bar = alphas_bar
        self.alphas_bar_prev = alphas_bar_prev
        # DDPM eq. 7: posterior variance of q(x_{t-1} | x_t, x_0)
        self.posterior_variance = betas * (1.0 - alphas_bar_prev) / (1.0 - alphas_bar)
        # signal-to-noise ratio of x_t relative to x_0, a standard lens for
        # comparing schedules (Kingma et al., "Variational Diffusion Models")
        self.snr = alphas_bar / (1.0 - alphas_bar)

    def as_curve(self) -> list[dict]:
        return [
            {
                "t": int(t),
                "beta": float(self.betas[t]),
                "alpha": float(self.alphas[t]),
                "alpha_bar": float(self.alphas_bar[t]),
                "snr": float(self.snr[t]),
            }
            for t in range(self.timesteps)
        ]
