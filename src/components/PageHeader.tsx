import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 pb-4 pt-5 md:px-0 md:pt-0">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  )
}
