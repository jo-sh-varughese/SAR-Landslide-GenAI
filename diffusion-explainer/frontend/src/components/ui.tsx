import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

export function Panel({
  children,
  className = '',
  title,
  eyebrow,
  right,
}: PropsWithChildren<{ className?: string; title?: ReactNode; eyebrow?: ReactNode; right?: ReactNode }>) {
  return (
    <div className={clsx('rounded-xl border border-(--color-border) bg-(--color-panel)', className)}>
      {(title || eyebrow || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-(--color-border-soft) px-4 py-3 sm:px-5">
          <div>
            {eyebrow && (
              <div className="text-[11px] font-medium tracking-[0.14em] text-(--color-ink-faint) uppercase">
                {eyebrow}
              </div>
            )}
            {title && <div className="mt-0.5 text-sm font-medium text-(--color-ink)">{title}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: PropsWithChildren<{ tone?: 'neutral' | 'accent' | 'forward' | 'reverse' | 'danger'; className?: string }>) {
  const tones: Record<string, string> = {
    neutral: 'bg-(--color-panel-2) text-(--color-ink-dim) border-(--color-border)',
    accent: 'bg-(--color-accent-dim)/30 text-(--color-accent) border-(--color-accent-dim)',
    forward: 'bg-(--color-forward-dim)/25 text-(--color-forward) border-(--color-forward-dim)',
    reverse: 'bg-(--color-reverse-dim)/25 text-(--color-reverse) border-(--color-reverse-dim)',
    danger: 'bg-(--color-danger)/15 text-(--color-danger) border-(--color-danger)/40',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function SectionHeading({
  kicker,
  title,
  children,
}: PropsWithChildren<{ kicker: string; title: ReactNode }>) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-(--color-accent) uppercase">{kicker}</div>
      <h2 className="font-serif-heading mt-1.5 text-2xl font-medium text-(--color-ink) sm:text-[28px]">{title}</h2>
      {children && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-(--color-ink-dim)">{children}</p>}
    </div>
  )
}

export function Callout({
  children,
  tone = 'accent',
  label,
}: PropsWithChildren<{ tone?: 'accent' | 'danger'; label: string }>) {
  const border = tone === 'accent' ? 'border-(--color-accent-dim)' : 'border-(--color-danger)/40'
  const bg = tone === 'accent' ? 'bg-(--color-accent-dim)/10' : 'bg-(--color-danger)/8'
  return (
    <div className={clsx('rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed', border, bg)}>
      <span className={clsx('mr-1.5 font-semibold', tone === 'accent' ? 'text-(--color-accent)' : 'text-(--color-danger)')}>
        {label}
      </span>
      <span className="text-(--color-ink-dim)">{children}</span>
    </div>
  )
}

export function Kbd({ children }: PropsWithChildren) {
  return (
    <span className="rounded border border-(--color-border) bg-(--color-panel-2) px-1.5 py-0.5 font-mono text-[11px] text-(--color-ink-dim)">
      {children}
    </span>
  )
}
