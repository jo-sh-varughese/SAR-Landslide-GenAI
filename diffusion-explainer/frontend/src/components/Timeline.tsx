import { useEffect, useRef } from 'react'
import type { DiffusionStep } from '../lib/api'

export function Timeline({
  steps,
  index,
  onIndexChange,
  playing,
  onTogglePlay,
  fps,
  onFpsChange,
}: {
  steps: DiffusionStep[]
  index: number
  onIndexChange: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
  fps: number
  onFpsChange: (v: number) => void
}) {
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = window.setInterval(() => {
      onIndexChange((i => (i + 1 >= steps.length ? 0 : i + 1))(index))
    }, 1000 / fps)
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, fps, index, steps.length])

  const forwardCount = steps.filter((s) => s.phase === 'forward').length
  const current = steps[index]

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-(--color-border) bg-(--color-panel-2) text-(--color-ink) hover:border-(--color-accent)"
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="3.5" height="10" />
              <rect x="7.5" y="1" width="3.5" height="10" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 1 L11 6 L2 11 Z" />
            </svg>
          )}
        </button>

        <div className="relative flex-1">
          {/* phase background */}
          <div className="pointer-events-none absolute top-1/2 left-0 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full">
            <div
              className="absolute inset-y-0 left-0 bg-(--color-forward-dim)"
              style={{ width: `${(forwardCount / steps.length) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-(--color-reverse-dim)"
              style={{ width: `${((steps.length - forwardCount) / steps.length) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            step={1}
            value={index}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            className="relative w-full bg-transparent"
          />
        </div>

        <select
          value={fps}
          onChange={(e) => onFpsChange(Number(e.target.value))}
          className="rounded-md border border-(--color-border) bg-(--color-panel-2) px-2 py-1 font-mono text-[11px] text-(--color-ink-dim) outline-none"
          title="Playback speed"
        >
          <option value={2}>2 fps</option>
          <option value={4}>4 fps</option>
          <option value={8}>8 fps</option>
          <option value={16}>16 fps</option>
        </select>
      </div>

      <div className="flex items-center justify-between text-[11px] text-(--color-ink-faint)">
        <span>
          step {index + 1} / {steps.length} ·{' '}
          <span className={current.phase === 'forward' ? 'text-(--color-forward)' : 'text-(--color-reverse)'}>
            {current.phase === 'forward' ? 'forward (adding noise)' : 'reverse (denoising)'}
          </span>{' '}
          · t = {current.t}
        </span>
        <span className="font-mono">ᾱₜ = {current.alpha_bar.toFixed(4)}</span>
      </div>
    </div>
  )
}
