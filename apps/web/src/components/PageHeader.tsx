import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="mb-0 mt-1 text-[15px] text-sub">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  )
}
