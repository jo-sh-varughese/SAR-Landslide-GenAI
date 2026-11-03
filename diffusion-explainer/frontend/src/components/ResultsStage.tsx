import type { ReactNode } from 'react'
import type { DiffusionStep, RunParams } from '../lib/api'
import { Badge } from './ui'

export function ResultsStage({ step, params }: { step: DiffusionStep; params: RunParams }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.3fr_1fr_0.8fr]">
      <Frame label="Current frame xₜ" tone={step.phase}>
        <img src={step.image} alt={`diffusion step t=${step.t}`} className="h-full w-full object-cover" />
      </Frame>

      <Frame label="Predicted x̂₀ (model's guess at the final image)" tone={step.phase} dim={!step.predicted_x0}>
        {step.predicted_x0 ? (
          <img src={step.predicted_x0} alt="predicted x0" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-(--color-ink-faint)">
            Only estimated during the reverse phase — this is a forward (noising) frame.
          </div>
        )}
      </Frame>

      <Frame label={`Latent grid ${params.latent_size}×${params.latent_size}`} tone={step.phase}>
        <img
          src={step.latent_thumb}
          alt="latent thumbnail"
          className="h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      </Frame>
    </div>
  )
}

function Frame({
  label,
  tone,
  dim,
  children,
}: {
  label: string
  tone: 'forward' | 'reverse'
  dim?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11.5px] text-(--color-ink-dim)">{label}</span>
        <Badge tone={tone}>{tone}</Badge>
      </div>
      <div
        className="aspect-square overflow-hidden rounded-lg border bg-(--color-panel-2)"
        style={{
          borderColor: tone === 'forward' ? 'var(--color-forward-dim)' : 'var(--color-reverse-dim)',
          opacity: dim ? 0.6 : 1,
        }}
      >
        {children}
      </div>
    </div>
  )
}
