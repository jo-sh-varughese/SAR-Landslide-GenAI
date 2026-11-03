"""
Orchestrates one full run: encode -> forward-noise a real uploaded image ->
reverse-denoise it back -> decode -> collect every intermediate frame and
number the frontend needs to render a step-by-step, math-annotated timeline.

Step-index convention used throughout the returned JSON: `t` is diffusion
time, 0 = clean, higher = noisier, matching `schedules.NoiseSchedule`. The
forward phase walks t: 0 -> start_t (adding noise to a real photo); the
reverse phase walks t: start_t -> 0 (removing it again). `start_t` is set by
`strength` exactly like Stable Diffusion's img2img strength parameter: 1.0
starts from (near) pure noise, low values keep most of the original image
and only lightly perturb it.
"""
from __future__ import annotations

import time
import uuid

import numpy as np

from . import denoiser, diffusion, image_utils, perceptual_codec, text_conditioning
from .schedules import NoiseSchedule

IMAGE_SIZE = 192  # multiple of DOWNSAMPLE_FACTOR (8) -> 24x24 latent


def run_pipeline(
    image_bytes: bytes,
    prompt: str,
    steps: int,
    schedule_kind: str,
    guidance_scale: float,
    fidelity: float,
    strength: float,
    sampler: str,
    seed: int,
) -> dict:
    t0 = time.time()
    rng = np.random.default_rng(seed)

    x0_pixel = image_utils.load_image_to_array(image_bytes, IMAGE_SIZE)
    x0_latent = perceptual_codec.encode(x0_pixel)

    schedule = NoiseSchedule(timesteps=steps, kind=schedule_kind)
    start_t = max(1, min(steps - 1, round(strength * (steps - 1))))

    prompt_embedding = text_conditioning.embed_prompt(prompt)

    steps_out: list[dict] = []

    # --- forward phase: dissolve the real image into noise, t = 0..start_t,
    # using one shared noise draw so the trajectory blends smoothly rather
    # than flickering between independent random draws at each frame.
    shared_epsilon = rng.standard_normal(x0_latent.shape).astype(np.float32)
    for t in range(0, start_t + 1):
        ab = schedule.alphas_bar[t]
        x_t = np.sqrt(ab) * x0_latent + np.sqrt(1.0 - ab) * shared_epsilon
        steps_out.append(
            {
                "phase": "forward",
                "t": t,
                "alpha": float(schedule.alphas[t]),
                "alpha_bar": float(ab),
                "beta": float(schedule.betas[t]),
                "snr": float(schedule.snr[t]),
                "image": image_utils.array_to_png_b64(
                    perceptual_codec.decode(x_t, (IMAGE_SIZE, IMAGE_SIZE))
                ),
                "latent_thumb": image_utils.uint8_array_to_png_b64(
                    perceptual_codec.latent_to_thumbnail_rgb(x_t)
                ),
                "predicted_x0": None,
                "mse_to_original": None,
                "noise_rms": float(np.sqrt(np.mean(shared_epsilon**2))),
            }
        )

    x_current = np.sqrt(schedule.alphas_bar[start_t]) * x0_latent + np.sqrt(
        1.0 - schedule.alphas_bar[start_t]
    ) * shared_epsilon

    # --- reverse phase: denoise back, t = start_t..0
    for t in range(start_t, -1, -1):
        est = denoiser.estimate_epsilon(
            x_t=x_current,
            x0_true=x0_latent,
            t=t,
            schedule=schedule,
            fidelity=fidelity,
            prompt_embedding=prompt_embedding,
            guidance_scale=guidance_scale,
            rng=rng,
        )
        eps_final = est["eps_final"]

        if sampler == "ddim":
            x_prev, x0_hat = diffusion.ddim_reverse_step(x_current, eps_final, t, t - 1, schedule)
        else:
            x_prev, x0_hat = diffusion.ddpm_reverse_step(x_current, eps_final, t, schedule, rng)

        mse = float(np.mean((x0_hat - x0_latent) ** 2))
        steps_out.append(
            {
                "phase": "reverse",
                "t": t,
                "alpha": float(schedule.alphas[t]),
                "alpha_bar": float(schedule.alphas_bar[t]),
                "beta": float(schedule.betas[t]),
                "snr": float(schedule.snr[t]),
                "image": image_utils.array_to_png_b64(
                    perceptual_codec.decode(x_prev, (IMAGE_SIZE, IMAGE_SIZE))
                ),
                "latent_thumb": image_utils.uint8_array_to_png_b64(
                    perceptual_codec.latent_to_thumbnail_rgb(x_prev)
                ),
                "predicted_x0": image_utils.array_to_png_b64(
                    perceptual_codec.decode(x0_hat, (IMAGE_SIZE, IMAGE_SIZE))
                ),
                "mse_to_original": mse,
                "noise_rms": float(np.sqrt(np.mean(eps_final**2))),
            }
        )
        x_current = x_prev

    final_image = perceptual_codec.decode(x_current, (IMAGE_SIZE, IMAGE_SIZE))

    return {
        "run_id": uuid.uuid4().hex[:12],
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
        "params": {
            "prompt": prompt,
            "steps": steps,
            "schedule": schedule_kind,
            "guidance_scale": guidance_scale,
            "fidelity": fidelity,
            "strength": strength,
            "sampler": sampler,
            "seed": seed,
            "image_size": IMAGE_SIZE,
            "latent_size": IMAGE_SIZE // perceptual_codec.DOWNSAMPLE_FACTOR,
            "start_t": start_t,
        },
        "prompt_embedding": prompt_embedding.tolist(),
        "schedule_curve": schedule.as_curve(),
        "original_image": image_utils.array_to_png_b64(x0_pixel),
        "final_image": image_utils.array_to_png_b64(final_image),
        "steps": steps_out,
    }
