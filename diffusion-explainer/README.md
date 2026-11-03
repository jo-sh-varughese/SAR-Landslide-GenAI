# Diffusion, Traced

A sample project that runs the real forward-noising / reverse-denoising math of a
Denoising Diffusion Probabilistic Model (DDPM/DDIM) on an image you upload, and
shows every step — with the governing equation, live-substituted numbers, and
telemetry charts — in a from-scratch React frontend.

This is a **separate, self-contained project** from the SAR-Landslide-GenAI app in
the parent directory. It shares nothing with it besides living in the same repo.

## What's real, what's simulated

The diffusion mathematics is exact — closed-form forward process, DDPM posterior
sampling, DDIM sampling, and the classifier-free guidance combination formula are
all implemented from the papers with no approximation (`backend/app/diffusion.py`,
`schedules.py`). Nothing here downloads a model or needs a GPU, because the one
thing that *is* simulated is the noise-prediction network itself: real Stable
Diffusion uses an ~860M-parameter UNet trained on billions of images, which is out
of scope for a sample project. Instead, `backend/app/denoiser.py` exposes a
**fidelity** slider that interpolates between the mathematically-exact noise
(computable because the pipeline knows the true `x_0`) and pure random noise —
an honest, explicit stand-in rather than a hidden shortcut. The VAE (perceptual
compression) and text encoder are similarly replaced with simple deterministic
stand-ins, documented in `perceptual_codec.py` and `text_conditioning.py` and
recapped in the app's own "Theory §9" section.

## Quick start

### Backend (FastAPI)

```bash
cd backend
py -3.11 -m venv .venv          # Windows
# python3 -m venv .venv         # macOS/Linux
.venv\Scripts\pip install -r requirements.txt   # Windows
# .venv/bin/pip install -r requirements.txt     # macOS/Linux

.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010   # Windows
# .venv/bin/uvicorn app.main:app --port 8010                   # macOS/Linux
```

Interactive API docs: http://127.0.0.1:8010/docs

### Frontend (Vite + React + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5731 (fixed via `vite.config.ts`; the backend's CORS
allowlist in `app/main.py` must match if you change it).

### Both at once

```
.\run.ps1     # Windows PowerShell
./run.sh      # macOS/Linux/Git Bash
```

## How it works

1. Upload any photo — it's center-cropped to a square and resized to 192×192.
2. **Encode**: box-filter downsampled ×8 to a 24×24 "latent" (a linear stand-in
   for a trained VAE — see above).
3. **Forward process**: noised step-by-step from t=0 to `start_t` (controlled by
   the `strength` slider, exactly like Stable Diffusion's img2img parameter) using
   the exact closed-form `q(x_t | x_0)`.
4. **Reverse process**: denoised back from `start_t` to t=0 using either ancestral
   DDPM sampling or deterministic DDIM sampling, with classifier-free guidance
   combining a prompt-nudged and unconditional noise estimate at every step.
5. **Decode**: bicubic-upsampled back to 192×192 pixels.

Every one of those steps is returned to the frontend — the decoded frame, the
model's Tweedie estimate of the final image, the raw latent as a pixelated
thumbnail, and the exact `β_t`, `α_t`, `ᾱ_t`, SNR, noise magnitude, and
reconstruction error — so the timeline scrubber, math panel, and charts in the UI
are all reading real numbers from that specific run, not canned data.

## Project layout

```
diffusion-explainer/
├── backend/
│   ├── app/
│   │   ├── schedules.py          linear & cosine β_t schedules (Ho et al. / Nichol & Dhariwal)
│   │   ├── diffusion.py          forward process, DDPM/DDIM reverse steps, CFG — all exact
│   │   ├── denoiser.py           the one simulated piece: fidelity-interpolated noise estimate
│   │   ├── perceptual_codec.py   simulated VAE stand-in (box-filter encode / bicubic decode)
│   │   ├── text_conditioning.py  simulated text-encoder stand-in (hashed pseudo-embedding)
│   │   ├── pipeline.py           orchestrates one full run, collects per-step telemetry
│   │   ├── image_utils.py        upload decoding, base64 PNG encoding
│   │   └── main.py               FastAPI app: /api/diffuse, /api/schedule-preview, /health
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx                     page layout / state
│       ├── components/
│       │   ├── ArchitectureDiagram.tsx  SVG pipeline diagram, real vs. simulated stages labeled
│       │   ├── ControlsPanel.tsx        prompt, steps, schedule, sampler, guidance, fidelity, seed
│       │   ├── UploadDropzone.tsx       drag-and-drop image upload
│       │   ├── Timeline.tsx             forward/reverse scrubber with autoplay
│       │   ├── ResultsStage.tsx         current frame / predicted x̂₀ / latent thumbnail
│       │   ├── MathPanel.tsx            live KaTeX equations with the current step's real numbers
│       │   ├── TelemetryCharts.tsx      ᾱₜ, noise magnitude, reconstruction-error charts (Recharts)
│       │   ├── ScheduleComparisonChart.tsx  linear vs. cosine ᾱₜ reference chart
│       │   └── ExplainerArticle.tsx     the full derivation, §1–§9
│       └── lib/api.ts                  typed fetch client for the backend
└── run.ps1 / run.sh
```

## API

| Method | Path                    | Description                                               |
|---|---|---|
| `POST` | `/api/diffuse`          | multipart image + params → full run JSON (steps, telemetry, images) |
| `GET`  | `/api/schedule-preview` | linear vs. cosine `ᾱ_t` curves for the reference chart, no image needed |
| `GET`  | `/health`               | liveness check |

## References

Sohl-Dickstein et al. 2015 · Ho, Jain & Abbeel 2020 (DDPM) · Song, Meng & Ermon
2021 (DDIM) · Nichol & Dhariwal 2021 (cosine schedule, IDDPM) · Ho & Salimans 2021
(classifier-free guidance) · Rombach, Blattmann, Lorenz, Esser & Ommer 2022
(latent diffusion / Stable Diffusion).
