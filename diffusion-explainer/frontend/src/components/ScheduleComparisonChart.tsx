import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchSchedulePreview, type ScheduleCurvePoint } from '../lib/api'
import { Panel } from './ui'

const axisStyle = { fontSize: 11, fill: 'var(--color-ink-faint)' }

export function ScheduleComparisonChart() {
  const [data, setData] = useState<{ linear: ScheduleCurvePoint[]; cosine: ScheduleCurvePoint[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchSchedulePreview(50)
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <Panel eyebrow="Reference" title="Linear vs. cosine ᾱₜ schedule">
        <div className="py-6 text-center text-[13px] text-(--color-ink-faint)">
          Couldn't reach the backend — start it to see this chart (see README).
        </div>
      </Panel>
    )
  }
  if (!data) {
    return (
      <Panel eyebrow="Reference" title="Linear vs. cosine ᾱₜ schedule">
        <div className="py-6 text-center text-[13px] text-(--color-ink-faint)">Loading…</div>
      </Panel>
    )
  }

  const merged = data.linear.map((l, i) => ({
    t: l.t,
    linear: l.alpha_bar,
    cosine: data.cosine[i]?.alpha_bar,
  }))

  return (
    <Panel
      eyebrow="Reference · computed from schedules.py, not a run"
      title="Why the cosine schedule was introduced"
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={merged} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
          <XAxis dataKey="t" tick={axisStyle} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 1]} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="linear" name="linear" stroke="var(--color-forward)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="cosine" name="cosine" stroke="var(--color-reverse)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[13px] leading-relaxed text-(--color-ink-dim)">
        The linear schedule (Ho et al., 2020) destroys most of the signal in the first third of the
        trajectory — by t≈15/50, ᾱₜ is already near zero, so many timesteps near the end contribute
        almost nothing. Nichol &amp; Dhariwal (2021) proposed the cosine schedule specifically to spend
        more of the trajectory in the useful low-noise-to-moderate-noise regime, which they found
        improved sample quality and log-likelihood.
      </p>
    </Panel>
  )
}
