import { Badge } from './ui'

interface Stage {
  label: string
  sub: string
  real: boolean
}

const stages: Stage[] = [
  { label: 'Image', sub: '192×192×3 pixels', real: true },
  { label: 'Encoder', sub: 'compress ×8', real: false },
  { label: 'Latent z₀', sub: '24×24×3', real: true },
  { label: 'Forward q(xₜ|x₀)', sub: 'add Gaussian noise', real: true },
  { label: 'z_T (noisy)', sub: 'partial or full noise', real: true },
]

const reverseSub = [
  { label: 'ε_θ predictor', sub: 'noise estimate', real: false },
  { label: 'CFG combine', sub: 'ε_uncond + w·Δ', real: true },
  { label: 'Reverse step', sub: 'DDPM / DDIM', real: true },
]

export function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[860px] flex-col gap-8 px-1 py-2">
        {/* forward row */}
        <div className="flex items-center gap-2">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <StageBox {...s} accent="forward" />
              {i < stages.length - 1 && <Arrow color="var(--color-forward)" />}
            </div>
          ))}
        </div>

        {/* reverse loop */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <StageBox label="z_T" sub="start of reverse" real accent="reverse" />
            <Arrow color="var(--color-reverse)" />
            <div className="relative rounded-xl border border-dashed border-(--color-reverse-dim) px-4 py-3">
              <div className="absolute -top-2.5 left-3 bg-(--color-panel) px-1.5 text-[10px] font-semibold tracking-wide text-(--color-reverse) uppercase">
                repeat t = T … 0
              </div>
              <div className="flex items-center gap-2 pt-1">
                {reverseSub.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <StageBox {...s} accent="reverse" small />
                    {i < reverseSub.length - 1 && <Arrow color="var(--color-reverse)" small />}
                  </div>
                ))}
              </div>
            </div>
            <Arrow color="var(--color-reverse)" />
            <StageBox label={'ẑ₀'} sub="denoised latent" real accent="reverse" />
            <Arrow color="var(--color-reverse)" />
            <StageBox label="Decoder" sub="upsample ×8" real={false} accent="reverse" />
            <Arrow color="var(--color-reverse)" />
            <StageBox label="Result" sub="192×192×3" real accent="reverse" />
          </div>
          {/* text conditioning branch */}
          <div className="mt-3 flex items-center gap-2 pl-[196px]">
            <div className="h-6 w-px border-l border-dashed border-(--color-accent-dim)" />
          </div>
          <div className="flex items-center gap-2 pl-[148px]">
            <StageBox label="Prompt" sub='"a red car…"' real accent="accent" small />
            <Arrow color="var(--color-accent)" small />
            <StageBox label="Text embed" sub="pseudo-CLIP" real={false} accent="accent" small />
            <span className="text-[11px] text-(--color-ink-faint)">→ biases ε_θ predictor above</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-(--color-border-soft) pt-3">
          <Badge tone="reverse">● real diffusion math</Badge>
          <Badge tone="forward">● simulated component (see caption)</Badge>
        </div>
      </div>
    </div>
  )
}

function StageBox({
  label,
  sub,
  real,
  accent,
  small,
}: {
  label: string
  sub: string
  real: boolean
  accent: 'forward' | 'reverse' | 'accent'
  small?: boolean
}) {
  const ring = real
    ? `var(--color-${accent})`
    : 'var(--color-ink-faint)'
  return (
    <div
      className="shrink-0 rounded-lg border bg-(--color-panel-2) text-center"
      style={{
        borderColor: ring,
        borderStyle: real ? 'solid' : 'dashed',
        padding: small ? '6px 10px' : '10px 14px',
        minWidth: small ? 92 : 116,
      }}
    >
      <div className={small ? 'text-[11.5px] font-medium text-(--color-ink)' : 'text-[13px] font-medium text-(--color-ink)'}>
        {label}
      </div>
      <div className="mt-0.5 text-[10.5px] text-(--color-ink-faint)">{sub}</div>
    </div>
  )
}

function Arrow({ color, small }: { color: string; small?: boolean }) {
  return (
    <svg width={small ? 20 : 28} height="10" viewBox="0 0 28 10" className="shrink-0">
      <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="1.5" />
      <path d="M22 1 L27 5 L22 9" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
