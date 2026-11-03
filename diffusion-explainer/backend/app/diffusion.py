"""
The actual diffusion math: forward (noising) process, the reverse
(denoising) step for both DDPM ancestral sampling and DDIM, and
classifier-free guidance. Every formula here is the real one from the
papers cited inline — nothing in this file is simulated. The only
simulated quantity anywhere in this project is *where the predicted noise
epsilon_theta comes from* (see `denoiser.py`): a trained UNet, in real
Stable Diffusion.
"""
from __future__ import annotations

import numpy as np

from .schedules import NoiseSchedule


def forward_diffuse(
    x0: np.ndarray, t: int, schedule: NoiseSchedule, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Closed-form sample from q(x_t | x_0) (DDPM eq. 4, reparameterized):

        x_t = sqrt(alpha_bar_t) * x_0 + sqrt(1 - alpha_bar_t) * epsilon,  epsilon ~ N(0, I)

    This is exact — no iteration needed to jump straight from x_0 to any x_t.
    """
    epsilon = rng.standard_normal(x0.shape).astype(np.float32)
    ab = schedule.alphas_bar[t]
    x_t = np.sqrt(ab) * x0 + np.sqrt(1.0 - ab) * epsilon
    return x_t.astype(np.float32), epsilon


def oracle_epsilon(x_t: np.ndarray, x0: np.ndarray, t: int, schedule: NoiseSchedule) -> np.ndarray:
    """Invert the forward formula to get the exact noise that would map x_0 -> x_t:

        epsilon = (x_t - sqrt(alpha_bar_t) * x_0) / sqrt(1 - alpha_bar_t)

    A perfect denoiser (epsilon_theta = this) reconstructs x_0 exactly in one
    step. `denoiser.py` mixes this with random noise to simulate an
    imperfectly-trained model.
    """
    ab = schedule.alphas_bar[t]
    denom = max(np.sqrt(1.0 - ab), 1e-8)
    return ((x_t - np.sqrt(ab) * x0) / denom).astype(np.float32)


def predicted_x0_from_epsilon(x_t: np.ndarray, epsilon: np.ndarray, t: int, schedule: NoiseSchedule) -> np.ndarray:
    """Invert the forward formula the other way — Tweedie's estimate of x_0 given
    the model's noise prediction (used by both DDPM and DDIM sampling):

        x0_hat = (x_t - sqrt(1 - alpha_bar_t) * epsilon) / sqrt(alpha_bar_t)
    """
    ab = schedule.alphas_bar[t]
    x0_hat = (x_t - np.sqrt(1.0 - ab) * epsilon) / np.sqrt(max(ab, 1e-8))
    return np.clip(x0_hat, -1.0, 1.0).astype(np.float32)


def ddpm_reverse_step(
    x_t: np.ndarray, epsilon: np.ndarray, t: int, schedule: NoiseSchedule, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Ancestral DDPM sampling step, q(x_{t-1} | x_t, x_0) posterior mean/variance
    (Ho et al. 2020, eq. 6-7), expressed directly in terms of the noise
    prediction (their eq. 11):

        mu_theta(x_t, t) = 1/sqrt(alpha_t) * ( x_t - beta_t/sqrt(1-alpha_bar_t) * epsilon )
        x_{t-1} = mu_theta + sigma_t * z,   z ~ N(0, I) if t > 0 else 0
        sigma_t^2 = posterior_variance_t = beta_t * (1 - alpha_bar_{t-1}) / (1 - alpha_bar_t)
    """
    alpha_t = schedule.alphas[t]
    beta_t = schedule.betas[t]
    ab_t = schedule.alphas_bar[t]

    mean = (1.0 / np.sqrt(alpha_t)) * (x_t - (beta_t / np.sqrt(1.0 - ab_t)) * epsilon)

    if t > 0:
        z = rng.standard_normal(x_t.shape).astype(np.float32)
        sigma_t = np.sqrt(max(schedule.posterior_variance[t], 0.0))
        x_prev = mean + sigma_t * z
    else:
        x_prev = mean

    x0_hat = predicted_x0_from_epsilon(x_t, epsilon, t, schedule)
    return x_prev.astype(np.float32), x0_hat


def ddim_reverse_step(
    x_t: np.ndarray, epsilon: np.ndarray, t: int, t_prev: int, schedule: NoiseSchedule
) -> tuple[np.ndarray, np.ndarray]:
    """Deterministic DDIM step, eta=0 (Song, Meng & Ermon, 2020, "Denoising
    Diffusion Implicit Models", eq. 12):

        x0_hat = (x_t - sqrt(1-alpha_bar_t) * epsilon) / sqrt(alpha_bar_t)
        x_{t-1} = sqrt(alpha_bar_{t-1}) * x0_hat + sqrt(1-alpha_bar_{t-1}) * epsilon

    No random draw — the same (x_t, epsilon) always yields the same
    x_{t-1}, which is DDIM's key property vs. ancestral DDPM sampling.
    """
    x0_hat = predicted_x0_from_epsilon(x_t, epsilon, t, schedule)
    ab_prev = schedule.alphas_bar[t_prev] if t_prev >= 0 else 1.0
    x_prev = np.sqrt(ab_prev) * x0_hat + np.sqrt(max(1.0 - ab_prev, 0.0)) * epsilon
    return x_prev.astype(np.float32), x0_hat


def classifier_free_guidance(eps_uncond: np.ndarray, eps_cond: np.ndarray, guidance_scale: float) -> np.ndarray:
    """Ho & Salimans, "Classifier-Free Diffusion Guidance" (2021), eq. 6:

        epsilon_hat = epsilon_uncond + w * (epsilon_cond - epsilon_uncond)

    w=1 recovers plain conditional sampling; w=0 ignores the prompt
    entirely; w>1 (the regime real SD uses, typically 7-8) extrapolates
    past the conditional estimate, trading sample diversity for prompt
    adherence.
    """
    return eps_uncond + guidance_scale * (eps_cond - eps_uncond)
