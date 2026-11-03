"""
Real, model-backed image editing — the counterpart to the simulated math demo
in diffusion.py/denoiser.py. This module runs an actual trained network:
InstructPix2Pix (Brooks, Holynski & Efros, "InstructPix2Pix: Learning to
Follow Image Editing Instructions," CVPR 2023), via Hugging Face `diffusers`.
It takes a real photo and a plain-English instruction ("add a river") and
produces a genuinely edited image — nothing here is a stand-in.

This machine has no CUDA GPU, so inference runs on CPU, which is slow
(minutes per edit). To keep the UI honest and responsive during that wait,
each edit runs as a background job with live step-by-step progress rather
than a single blocking request:

  POST /api/edit         -> {job_id}            (returns immediately)
  GET  /api/edit/{job_id} -> {status, step, ...} (poll while running)

Heavy imports (torch, diffusers) are deferred to first use so the rest of
the API works even before/without those optional dependencies installed
(see requirements-real-edit.txt).
"""
from __future__ import annotations

import base64
import io
import threading
import time
import uuid
from dataclasses import dataclass, field

from PIL import Image

MODEL_ID = "timbrooks/instruct-pix2pix"

_pipe = None
_pipe_lock = threading.Lock()
# The cached pipeline (and its scheduler, which carries step-count-dependent
# internal state such as `_step_index`/`sigmas`) is not safe to run from two
# threads at once — two concurrent jobs corrupt each other's scheduler state
# and fail with bogus "index out of bounds" errors. CPU inference gains
# nothing from parallelism anyway, so jobs are simply serialized.
_run_lock = threading.Lock()


@dataclass
class Job:
    status: str = "queued"  # queued -> loading_model -> running -> done -> error
    step: int = 0
    total_steps: int = 0
    started_at: float = field(default_factory=time.time)
    phase: str = "queued"
    phase_started_at: float = field(default_factory=time.time)
    result_b64: str | None = None
    error: str | None = None


JOBS: dict[str, Job] = {}


def dependencies_ready() -> tuple[bool, str | None]:
    try:
        import torch  # noqa: F401
        import diffusers  # noqa: F401
    except ImportError as exc:
        return False, str(exc)
    return True, None


def _get_pipeline():
    global _pipe
    with _pipe_lock:
        if _pipe is None:
            import torch
            from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionInstructPix2PixPipeline

            pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )
            pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
            pipe.to("cpu")
            pipe.set_progress_bar_config(disable=True)
            _pipe = pipe
        return _pipe


def start_job(
    image: Image.Image,
    instruction: str,
    steps: int,
    image_guidance_scale: float,
    guidance_scale: float,
    seed: int,
    size: int,
) -> str:
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = Job(status="queued", total_steps=steps, phase="queued")
    t = threading.Thread(
        target=_run_job,
        args=(job_id, image.convert("RGB"), instruction, steps, image_guidance_scale, guidance_scale, seed, size),
        daemon=True,
    )
    t.start()
    return job_id


def _run_job(
    job_id: str,
    image: Image.Image,
    instruction: str,
    steps: int,
    image_guidance_scale: float,
    guidance_scale: float,
    seed: int,
    size: int,
) -> None:
    job = JOBS[job_id]
    try:
        import torch

        ready, reason = dependencies_ready()
        if not ready:
            raise RuntimeError(f"real-edit dependencies not installed yet: {reason}")

        # Stay "queued" while waiting for another job to finish — only one
        # inference runs at a time (see _run_lock).
        with _run_lock:
            job.status = "loading_model"
            job.phase = "loading_model"
            job.phase_started_at = time.time()
            pipe = _get_pipeline()  # first call downloads ~5GB + loads onto CPU

            job.status = "running"
            job.phase = "running"
            job.phase_started_at = time.time()
            job.step = 0

            img = image.resize((size, size))

            def on_step_end(pipe_, step_index, timestep, callback_kwargs):
                job.step = step_index + 1
                return callback_kwargs

            generator = torch.Generator().manual_seed(seed)
            result = pipe(
                instruction,
                image=img,
                num_inference_steps=steps,
                image_guidance_scale=image_guidance_scale,
                guidance_scale=guidance_scale,
                generator=generator,
                callback_on_step_end=on_step_end,
            ).images[0]

            buf = io.BytesIO()
            result.save(buf, format="PNG")
            job.result_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            job.status = "done"
            job.phase = "done"
    except Exception as exc:  # noqa: BLE001 - surface to the polling client
        job.error = str(exc)
        job.status = "error"


def job_view(job_id: str) -> dict | None:
    job = JOBS.get(job_id)
    if job is None:
        return None
    now = time.time()
    return {
        "job_id": job_id,
        "status": job.status,
        "phase": job.phase,
        "step": job.step,
        "total_steps": job.total_steps,
        "elapsed_s": round(now - job.started_at, 1),
        "phase_elapsed_s": round(now - job.phase_started_at, 1),
        "result": job.result_b64,
        "error": job.error,
    }
