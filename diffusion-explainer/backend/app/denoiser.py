"""
The one genuinely simulated piece of this project: where epsilon_theta(x_t, t, c)
comes from.

In real Stable Diffusion this is a ~860M-parameter, timestep- and
text-conditioned UNet with cross-attention, trained on billions of
image/caption pairs with the noise-prediction loss

    L_simple = E_{x0,epsilon,t,c} [ || epsilon - epsilon_theta(x_t, t, c) ||^2 ]

(Ho et al. 2020, eq. 14). Training that is obviously out of scope for a
sample project. Instead of faking a fixed "good" denoiser, this module
exposes a `fidelity` in [0, 1] that interpolates between:

  - fidelity=1.0: the *oracle* noise estimate (diffusion.oracle_epsilon) —
    mathematically exact, so ancestral/DDIM sampling reconstructs x_0
    perfectly. This isolates the sampler math from model quality.
  - fidelity=0.0: pure random noise, i.e. a maximally undertrained model —
    the reverse process then does a random walk and never recovers
    structure.

Intermediate values show the realistic middle ground: partial, textured
reconstruction with characteristic diffusion-model artifacts (blur at low
fidelity, hallucinated high-frequency detail near fidelity~1). This is a
genuinely useful pedagogical knob — "what does it mean for a denoiser to be
50% as good?" — even though no real UNet computes a "fidelity" number.

Text conditioning (`text_conditioning.bias_field`) is applied on top of
this base estimate: the conditional estimate is nudged away from the
unconditional one, and `diffusion.classifier_free_guidance` amplifies that
difference by `guidance_scale` — structurally identical to how real
classifier-free guidance combines two UNet forward passes, just with a
much simpler source for the "conditional" signal.
"""
from __future__ import annotations

import numpy as np

from . import diffusion, text_conditioning
from .schedules import NoiseSchedule


def estimate_epsilon(
    x_t: np.ndarray,
    x0_true: np.ndarray,
    t: int,
    schedule: NoiseSchedule,
    fidelity: float,
    prompt_embedding: np.ndarray,
    guidance_scale: float,
    rng: np.random.Generator,
) -> dict[str, np.ndarray]:
    fidelity = float(np.clip(fidelity, 0.0, 1.0))

    oracle = diffusion.oracle_epsilon(x_t, x0_true, t, schedule)
    random_noise = rng.standard_normal(x_t.shape).astype(np.float32)
    base = fidelity * oracle + (1.0 - fidelity) * random_noise

    field = text_conditioning.bias_field(prompt_embedding, x_t.shape)
    # Conditioning nudges the *unconditional* base estimate. Scaled down
    # (0.35) and by fidelity, so a garbage model can't be "rescued" by a
    # strong prompt bias — mirrors how guidance amplifies whatever
    # structure the base model can already represent.
    eps_uncond = base
    eps_cond = base - 0.35 * fidelity * field.astype(np.float32)

    eps_final = diffusion.classifier_free_guidance(eps_uncond, eps_cond, guidance_scale)

    return {
        "eps_uncond": eps_uncond,
        "eps_cond": eps_cond,
        "eps_final": eps_final,
        "oracle": oracle,
    }
