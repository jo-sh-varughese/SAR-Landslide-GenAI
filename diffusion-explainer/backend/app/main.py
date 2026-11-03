from __future__ import annotations

import io

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from . import real_edit
from .pipeline import run_pipeline
from .schedules import NoiseSchedule

app = FastAPI(
    title="Diffusion Explainer API",
    description="Runs a real DDPM/DDIM forward+reverse trajectory on an uploaded "
    "image, with an intentionally simulated denoiser (see app/denoiser.py) "
    "in place of a trained UNet, so it needs no GPU and no model download.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5731", "http://127.0.0.1:5731"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/schedule-preview")
def schedule_preview(steps: int = 40) -> dict:
    steps = max(4, min(steps, 200))
    return {
        "linear": NoiseSchedule(timesteps=steps, kind="linear").as_curve(),
        "cosine": NoiseSchedule(timesteps=steps, kind="cosine").as_curve(),
    }


@app.post("/api/diffuse")
async def diffuse(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    steps: int = Form(24),
    schedule: str = Form("cosine"),
    guidance_scale: float = Form(7.5),
    fidelity: float = Form(0.85),
    strength: float = Form(0.75),
    sampler: str = Form("ddpm"),
    seed: int = Form(42),
) -> dict:
    if schedule not in ("linear", "cosine"):
        raise HTTPException(400, "schedule must be 'linear' or 'cosine'")
    if sampler not in ("ddpm", "ddim"):
        raise HTTPException(400, "sampler must be 'ddpm' or 'ddim'")
    if not (2 <= steps <= 60):
        raise HTTPException(400, "steps must be between 2 and 60")
    if not (0.0 <= strength <= 1.0):
        raise HTTPException(400, "strength must be between 0 and 1")
    if not (0.0 <= fidelity <= 1.0):
        raise HTTPException(400, "fidelity must be between 0 and 1")
    if not (0.0 <= guidance_scale <= 20.0):
        raise HTTPException(400, "guidance_scale must be between 0 and 20")

    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "image too large (max 10MB)")
    if not data:
        raise HTTPException(400, "empty image upload")

    try:
        result = run_pipeline(
            image_bytes=data,
            prompt=prompt,
            steps=steps,
            schedule_kind=schedule,
            guidance_scale=guidance_scale,
            fidelity=fidelity,
            strength=strength,
            sampler=sampler,
            seed=seed,
        )
    except Exception as exc:  # noqa: BLE001 - surface pipeline errors to the client
        raise HTTPException(400, f"could not process image: {exc}") from exc

    return result


# --- Real, model-backed editing (InstructPix2Pix) -------------------------
# Counterpart to /api/diffuse: this actually understands the instruction.
# CPU-only on this machine, so it runs as a polled background job.

MAX_EDIT_STEPS = 60


@app.get("/api/edit/ready")
def edit_ready() -> dict:
    ready, reason = real_edit.dependencies_ready()
    return {"ready": ready, "reason": reason, "model_id": real_edit.MODEL_ID}


@app.post("/api/edit")
async def edit_start(
    image: UploadFile = File(...),
    instruction: str = Form(...),
    steps: int = Form(15),
    image_guidance_scale: float = Form(1.5),
    guidance_scale: float = Form(7.5),
    seed: int = Form(42),
    size: int = Form(384),
) -> dict:
    ready, reason = real_edit.dependencies_ready()
    if not ready:
        raise HTTPException(
            503,
            f"real-edit dependencies not installed yet ({reason}). "
            f"pip install -r requirements-real-edit.txt in backend/.venv, then retry.",
        )
    if not instruction.strip():
        raise HTTPException(400, "instruction must not be empty")
    if not (1 <= steps <= MAX_EDIT_STEPS):
        raise HTTPException(400, f"steps must be between 1 and {MAX_EDIT_STEPS}")
    if size not in (256, 384, 512):
        raise HTTPException(400, "size must be 256, 384, or 512")

    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "image too large (max 10MB)")
    if not data:
        raise HTTPException(400, "empty image upload")

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"could not decode image: {exc}") from exc

    job_id = real_edit.start_job(
        image=img,
        instruction=instruction,
        steps=steps,
        image_guidance_scale=image_guidance_scale,
        guidance_scale=guidance_scale,
        seed=seed,
        size=size,
    )
    return {"job_id": job_id}


@app.get("/api/edit/{job_id}")
def edit_status(job_id: str) -> dict:
    view = real_edit.job_view(job_id)
    if view is None:
        raise HTTPException(404, "unknown job_id")
    return view
