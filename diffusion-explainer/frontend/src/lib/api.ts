export const API_BASE = 'http://127.0.0.1:8010'
// dev servers: frontend on :5731, backend on :8010 (see backend/app/main.py CORS + run.ps1/run.sh)

export interface ScheduleCurvePoint {
  t: number
  beta: number
  alpha: number
  alpha_bar: number
  snr: number
}

export interface DiffusionStep {
  phase: 'forward' | 'reverse'
  t: number
  alpha: number
  alpha_bar: number
  beta: number
  snr: number
  image: string
  latent_thumb: string
  predicted_x0: string | null
  mse_to_original: number | null
  noise_rms: number
}

export interface RunParams {
  prompt: string
  steps: number
  schedule: 'linear' | 'cosine'
  guidance_scale: number
  fidelity: number
  strength: number
  sampler: 'ddpm' | 'ddim'
  seed: number
  image_size: number
  latent_size: number
  start_t: number
}

export interface DiffusionRunResult {
  run_id: string
  elapsed_ms: number
  params: RunParams
  prompt_embedding: number[]
  schedule_curve: ScheduleCurvePoint[]
  original_image: string
  final_image: string
  steps: DiffusionStep[]
}

export interface RunRequest {
  image: File
  prompt: string
  steps: number
  schedule: 'linear' | 'cosine'
  guidance_scale: number
  fidelity: number
  strength: number
  sampler: 'ddpm' | 'ddim'
  seed: number
}

export async function runDiffusion(req: RunRequest): Promise<DiffusionRunResult> {
  const form = new FormData()
  form.set('image', req.image)
  form.set('prompt', req.prompt)
  form.set('steps', String(req.steps))
  form.set('schedule', req.schedule)
  form.set('guidance_scale', String(req.guidance_scale))
  form.set('fidelity', String(req.fidelity))
  form.set('strength', String(req.strength))
  form.set('sampler', req.sampler)
  form.set('seed', String(req.seed))

  const res = await fetch(`${API_BASE}/api/diffuse`, { method: 'POST', body: form })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail ?? `request failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchSchedulePreview(
  steps = 40,
): Promise<{ linear: ScheduleCurvePoint[]; cosine: ScheduleCurvePoint[] }> {
  const res = await fetch(`${API_BASE}/api/schedule-preview?steps=${steps}`)
  if (!res.ok) throw new Error(`request failed: ${res.status}`)
  return res.json()
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

// --- Real, model-backed editing (InstructPix2Pix) --------------------------

export interface EditReadyStatus {
  ready: boolean
  reason: string | null
  model_id: string
}

export async function checkEditReady(): Promise<EditReadyStatus> {
  const res = await fetch(`${API_BASE}/api/edit/ready`, { signal: AbortSignal.timeout(4000) })
  return res.json()
}

export interface EditRequest {
  image: File
  instruction: string
  steps: number
  image_guidance_scale: number
  guidance_scale: number
  seed: number
  size: 256 | 384 | 512
}

export async function startEdit(req: EditRequest): Promise<{ job_id: string }> {
  const form = new FormData()
  form.set('image', req.image)
  form.set('instruction', req.instruction)
  form.set('steps', String(req.steps))
  form.set('image_guidance_scale', String(req.image_guidance_scale))
  form.set('guidance_scale', String(req.guidance_scale))
  form.set('seed', String(req.seed))
  form.set('size', String(req.size))

  const res = await fetch(`${API_BASE}/api/edit`, { method: 'POST', body: form })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail ?? `request failed: ${res.status}`)
  }
  return res.json()
}

export type EditPhase = 'queued' | 'loading_model' | 'running' | 'done' | 'error'

export interface EditJobView {
  job_id: string
  status: EditPhase
  phase: EditPhase
  step: number
  total_steps: number
  elapsed_s: number
  phase_elapsed_s: number
  result: string | null
  error: string | null
}

export async function pollEditJob(jobId: string): Promise<EditJobView> {
  const res = await fetch(`${API_BASE}/api/edit/${jobId}`)
  if (!res.ok) throw new Error(`request failed: ${res.status}`)
  return res.json()
}
