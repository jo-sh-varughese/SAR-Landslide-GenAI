import type { Settings } from '../lib/settings'
import { Panel } from './ui'

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-(--color-ink)">{label}</span>
        <span className="font-mono text-[12.5px] tabular-nums text-(--color-accent)">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {hint && <div className="mt-1 text-[11px] text-(--color-ink-faint)">{hint}</div>}
    </label>
  )
}

export function ControlsPanel({
  settings,
  onChange,
  onRandomSeed,
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onRandomSeed: () => void
}) {
  return (
    <Panel eyebrow="Parameters" title="Diffusion configuration">
      <div className="space-y-5">
        <label className="block">
          <div className="mb-1.5 text-[13px] font-medium text-(--color-ink)">Prompt</div>
          <input
            value={settings.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="e.g. a red sports car at sunset"
            className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-accent)"
          />
          <div className="mt-1 text-[11px] text-(--color-ink-faint)">
            Steers the conditional noise estimate via classifier-free guidance below — see the honesty note on how
            conditioning is simulated here.
          </div>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <div className="mb-1.5 text-[13px] font-medium text-(--color-ink)">Noise schedule</div>
            <select
              value={settings.schedule}
              onChange={(e) => onChange({ schedule: e.target.value as Settings['schedule'] })}
              className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-ink) outline-none focus:border-(--color-accent)"
            >
              <option value="cosine">Cosine (Nichol &amp; Dhariwal)</option>
              <option value="linear">Linear (Ho et al.)</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] font-medium text-(--color-ink)">Sampler</div>
            <select
              value={settings.sampler}
              onChange={(e) => onChange({ sampler: e.target.value as Settings['sampler'] })}
              className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-ink) outline-none focus:border-(--color-accent)"
            >
              <option value="ddpm">DDPM (stochastic)</option>
              <option value="ddim">DDIM (deterministic)</option>
            </select>
          </label>
        </div>

        <Slider
          label="Steps (T)"
          value={settings.steps}
          min={4}
          max={50}
          step={1}
          onChange={(v) => onChange({ steps: v })}
          hint="Discretization of the diffusion trajectory. More steps → smoother schedule, slower run."
        />

        <Slider
          label="Strength (img2img)"
          value={settings.strength}
          min={0.05}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onChange({ strength: v })}
          hint="How far into noise the forward pass pushes before reversing. 1.0 ≈ generate from scratch; low values stay close to your photo."
        />

        <Slider
          label="Guidance scale (w)"
          value={settings.guidance_scale}
          min={0}
          max={20}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(v) => onChange({ guidance_scale: v })}
          hint="Classifier-free guidance strength. w=0 ignores the prompt; real SD typically uses 7–8."
        />

        <Slider
          label="Denoiser fidelity"
          value={settings.fidelity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ fidelity: v })}
          hint="Simulates how well-trained the noise predictor is. 100% = oracle (perfect reconstruction); 0% = untrained (random walk)."
        />

        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <div className="mb-1.5 text-[13px] font-medium text-(--color-ink)">Seed</div>
            <input
              type="number"
              value={settings.seed}
              onChange={(e) => onChange({ seed: Number(e.target.value) })}
              className="w-full rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2 font-mono text-sm text-(--color-ink) outline-none focus:border-(--color-accent)"
            />
          </label>
          <button
            type="button"
            onClick={onRandomSeed}
            className="rounded-md border border-(--color-border) bg-(--color-panel-2) px-3 py-2.5 text-(--color-ink-dim) hover:border-(--color-accent) hover:text-(--color-ink)"
            title="Randomize seed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 4h16v16H4V4Zm4 3.5v.01M16 7.5v.01M12 12v.01M8 16.5v.01M16 16.5v.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </Panel>
  )
}
