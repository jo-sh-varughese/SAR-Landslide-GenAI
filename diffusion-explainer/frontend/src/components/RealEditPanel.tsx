import { useEffect, useRef, useState } from 'react'
import {
  checkEditReady,
  pollEditJob,
  startEdit,
  type EditJobView,
  type EditReadyStatus,
} from '../lib/api'
import { UploadDropzone } from './UploadDropzone'
import { Badge, Callout, Panel } from './ui'

interface EditSettings {
  instruction: string
  steps: number
  size: 256 | 384 | 512
  imageGuidance: number
  textGuidance: number
  seed: number
}

const defaults: EditSettings = {
  instruction: 'add a river',
  steps: 15,
  size: 384,
  imageGuidance: 1.5,
  textGuidance: 7.5,
  seed: 42,
}

const PHASE_LABEL: Record<string, string> = {
  queued: 'Queued…',
  loading_model: 'Loading InstructPix2Pix…',
  running: 'Denoising…',
  done: 'Done',
  error: 'Failed',
}

export function RealEditPanel() {
  const [ready, setReady] = useState<EditReadyStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [settings, setSettings] = useState<EditSettings>(defaults)

  const [job, setJob] = useState<EditJobView | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const refreshReady = () => {
    setChecking(true)
    checkEditReady()
      .then(setReady)
      .catch(() => setReady({ ready: false, reason: 'backend unreachable', model_id: '' }))
      .finally(() => setChecking(false))
  }

  useEffect(() => {
    refreshReady()
  }, [])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  const handleRun = async () => {
    if (!file) {
      setError('Upload an image first.')
      return
    }
    if (!settings.instruction.trim()) {
      setError('Type an editing instruction, e.g. "add a river".')
      return
    }
    setError(null)
    setSubmitting(true)
    setJob(null)
    try {
      const { job_id } = await startEdit({
        image: file,
        instruction: settings.instruction,
        steps: settings.steps,
        image_guidance_scale: settings.imageGuidance,
        guidance_scale: settings.textGuidance,
        seed: settings.seed,
        size: settings.size,
      })
      pollRef.current = window.setInterval(async () => {
        try {
          const view = await pollEditJob(job_id)
          setJob(view)
          if (view.status === 'done' || view.status === 'error') {
            if (pollRef.current) window.clearInterval(pollRef.current)
            setSubmitting(false)
          }
        } catch (e) {
          if (pollRef.current) window.clearInterval(pollRef.current)
          setSubmitting(false)
          setError(e instanceof Error ? e.message : 'lost connection while polling job')
        }
      }, 1000)
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'could not start job')
    }
  }

  const running = job && (job.status === 'queued' || job.status === 'loading_model' || job.status === 'running')
  const eta =
    job?.status === 'running' && job.step > 0
      ? Math.max(0, Math.round((job.phase_elapsed_s / job.step) * (job.total_steps - job.step)))
      : null

  return (
    <Panel
      eyebrow="Real model, not simulated"
      title="InstructPix2Pix: edit a photo with an instruction"
      right={
        ready && (
          <Badge tone={ready.ready ? 'reverse' : 'danger'}>
            {checking ? 'checking…' : ready.ready ? 'model backend ready' : 'dependencies not installed'}
          </Badge>
        )
      }
    >
      <p className="mb-4 text-[14px] leading-relaxed text-(--color-ink-dim)">
        Unlike the math-trace demo above — where the "prompt" is an honest, simplified stand-in — this
        runs a real trained network (
        <a
          className="text-(--color-accent) hover:underline"
          href="https://huggingface.co/timbrooks/instruct-pix2pix"
          target="_blank"
          rel="noreferrer"
        >
          timbrooks/instruct-pix2pix
        </a>
        , Brooks, Holynski &amp; Efros 2023) that actually understands an instruction like{' '}
        <em>"add a river"</em> and edits the image accordingly. This machine has no GPU, so it runs on
        CPU — expect several minutes per edit, and the first run downloads ~5GB of model weights.
      </p>

      {ready && !ready.ready && (
        <Callout tone="danger" label="Not ready:">
          {ready.reason?.includes('No module') ? (
            <>
              Backend dependencies aren't installed yet. Run{' '}
              <code className="rounded bg-(--color-panel-2) px-1 py-0.5 text-[12px]">
                pip install -r requirements-real-edit.txt
              </code>{' '}
              in <code className="rounded bg-(--color-panel-2) px-1 py-0.5 text-[12px]">backend/.venv</code>, then{' '}
              <button type="button" onClick={refreshReady} className="text-(--color-accent) underline">
                check again
              </button>
              .
            </>
          ) : (
            <>
              {ready.reason ?? 'unknown error'} —{' '}
              <button type="button" onClick={refreshReady} className="text-(--color-accent) underline">
                check again
              </button>
              .
            </>
          )}
        </Callout>
      )}

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <UploadDropzone file={file} previewUrl={previewUrl} onFile={setFile} />

          <label className="block">
            <div className="mb-1.5 text-[13px] font-medium text-(--color-ink)">Instruction</div>
            <input
              value={settings.instruction}
              onChange={(e) => setSettings((s) => ({ ...s, instruction: e.target.value }))}
              placeholder='e.g. "add a river"'
              className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-accent)"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1.5 text-[12px] text-(--color-ink-dim)">Resolution</div>
              <select
                value={settings.size}
                onChange={(e) => setSettings((s) => ({ ...s, size: Number(e.target.value) as 256 | 384 | 512 }))}
                className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none"
              >
                <option value={256}>256px (fastest)</option>
                <option value={384}>384px (default)</option>
                <option value={512}>512px (slowest)</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-1.5 text-[12px] text-(--color-ink-dim)">Steps</div>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.steps}
                onChange={(e) => setSettings((s) => ({ ...s, steps: Number(e.target.value) }))}
                className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-2 py-1.5 font-mono text-[13px] text-(--color-ink) outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1.5 text-[12px] text-(--color-ink-dim)">Image guidance</div>
              <input
                type="number"
                step={0.1}
                min={1}
                max={3}
                value={settings.imageGuidance}
                onChange={(e) => setSettings((s) => ({ ...s, imageGuidance: Number(e.target.value) }))}
                className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-2 py-1.5 font-mono text-[13px] text-(--color-ink) outline-none"
              />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[12px] text-(--color-ink-dim)">Text guidance</div>
              <input
                type="number"
                step={0.5}
                min={1}
                max={15}
                value={settings.textGuidance}
                onChange={(e) => setSettings((s) => ({ ...s, textGuidance: Number(e.target.value) }))}
                className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-2 py-1.5 font-mono text-[13px] text-(--color-ink) outline-none"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={submitting || !file || !ready?.ready}
            className="w-full rounded-lg bg-(--color-reverse) py-3 text-[14px] font-medium text-(--color-bg) transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Editing…' : 'Edit image'}
          </button>
          {error && (
            <Callout tone="danger" label="Error:">
              {error}
            </Callout>
          )}
        </div>

        <div>
          {!job && !submitting && (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-(--color-border) text-center text-[13px] text-(--color-ink-faint)">
              Result appears here once you run an edit.
            </div>
          )}

          {job && running && (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-(--color-border) p-6 text-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-reverse)" />
              <div className="text-[14px] font-medium text-(--color-ink)">{PHASE_LABEL[job.phase]}</div>
              {job.phase === 'loading_model' && (
                <div className="max-w-xs text-[12px] text-(--color-ink-faint)">
                  downloading/loading model weights ({job.phase_elapsed_s.toFixed(0)}s so far) — this only
                  happens once
                </div>
              )}
              {job.phase === 'running' && (
                <>
                  <div className="w-full max-w-xs">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-panel-2)">
                      <div
                        className="h-full bg-(--color-reverse) transition-all"
                        style={{ width: `${(job.step / Math.max(job.total_steps, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="font-mono text-[12px] text-(--color-ink-faint)">
                    step {job.step}/{job.total_steps} · {job.phase_elapsed_s.toFixed(0)}s elapsed
                    {eta !== null && eta > 0 ? ` · ~${eta}s remaining` : ''}
                  </div>
                </>
              )}
            </div>
          )}

          {job?.status === 'error' && (
            <Callout tone="danger" label="Edit failed:">
              {job.error}
            </Callout>
          )}

          {job?.status === 'done' && job.result && previewUrl && (
            <div>
              <div className="mb-2 text-[12px] text-(--color-ink-faint)">
                done in {job.elapsed_s.toFixed(0)}s · "{settings.instruction}"
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 text-[11.5px] text-(--color-ink-dim)">original</div>
                  <img src={previewUrl} className="w-full rounded-lg border border-(--color-border)" />
                </div>
                <div>
                  <div className="mb-1.5 text-[11.5px] text-(--color-ink-dim)">edited</div>
                  <img src={job.result} className="w-full rounded-lg border border-(--color-reverse-dim)" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
