import { useEffect, useState } from 'react'
import { checkHealth } from '../lib/api'

export function Header() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    const tick = () => checkHealth().then((ok) => mounted && setOnline(ok))
    tick()
    const id = window.setInterval(tick, 15000)
    return () => {
      mounted = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-(--color-border-soft) bg-(--color-bg)/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-(--color-accent) to-(--color-reverse)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#08090d" strokeWidth="1.8" strokeDasharray="2.5 3.5" />
            </svg>
          </div>
          <span className="font-serif-heading text-[15px] font-medium text-(--color-ink)">Diffusion, Traced</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#theory" className="hidden text-[13px] text-(--color-ink-dim) hover:text-(--color-ink) sm:inline">
            Theory
          </a>
          <a href="#demo" className="hidden text-[13px] text-(--color-ink-dim) hover:text-(--color-ink) sm:inline">
            Demo
          </a>
          <a
            href="#real-edit"
            className="hidden text-[13px] text-(--color-ink-dim) hover:text-(--color-ink) sm:inline"
          >
            Real Edit
          </a>
          <div className="flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-panel) px-2.5 py-1 text-[11px] text-(--color-ink-dim)">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  online === null ? 'var(--color-ink-faint)' : online ? 'var(--color-reverse)' : 'var(--color-danger)',
              }}
            />
            {online === null ? 'checking API…' : online ? 'API online' : 'API offline'}
          </div>
        </div>
      </div>
    </header>
  )
}
