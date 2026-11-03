import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DiffusionStep } from '../lib/api'
import { Panel } from './ui'

const axisStyle = { fontSize: 11, fill: 'var(--color-ink-faint)' }

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg-raised) px-3 py-2 text-[11px] shadow-xl">
      <div className="mb-1 font-mono text-(--color-ink)">
        t={d.t} · {d.phase}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono">{typeof p.value === 'number' ? p.value.toFixed(4) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function TelemetryCharts({ steps, index }: { steps: DiffusionStep[]; index: number }) {
  const data = steps.map((s, i) => ({
    idx: i,
    t: s.t,
    phase: s.phase,
    alpha_bar: s.alpha_bar,
    noise_rms: s.noise_rms,
    mse: s.mse_to_original,
  }))
  const forwardEnd = steps.findIndex((s) => s.phase === 'reverse') - 1
  const reverseSteps = data.filter((d) => d.phase === 'reverse')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel eyebrow="Signal destruction / recovery" title="ᾱₜ and noise magnitude across the run">
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            {forwardEnd >= 0 && (
              <ReferenceArea x1={0} x2={forwardEnd} fill="var(--color-forward)" fillOpacity={0.06} />
            )}
            <XAxis dataKey="idx" tick={axisStyle} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 1]} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={index} stroke="var(--color-accent)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="alpha_bar"
              name="ᾱₜ"
              stroke="var(--color-reverse)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 text-center text-[11px] text-(--color-ink-faint)">
          shaded region = forward (noising) phase · line = ᾱₜ, the fraction of original signal variance remaining
        </div>
      </Panel>

      <Panel eyebrow="Reverse phase only" title="Reconstruction error vs. diffusion time">
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={reverseSteps} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis
              dataKey="t"
              reversed
              tick={axisStyle}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
              label={{ value: 't (decreasing →)', position: 'insideBottom', offset: -2, style: axisStyle }}
            />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {steps[index]?.phase === 'reverse' && (
              <ReferenceLine x={steps[index].t} stroke="var(--color-accent)" strokeDasharray="3 3" />
            )}
            <Line type="monotone" dataKey="mse" name="MSE(x̂₀, x₀)" stroke="var(--color-danger)" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 text-center text-[11px] text-(--color-ink-faint)">
          at fidelity=100% this should fall toward zero as t → 0; lower fidelity plateaus higher
        </div>
      </Panel>
    </div>
  )
}
