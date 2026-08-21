import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** The standard surface: soft 24px corners, hairline border, lifted shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-line bg-card text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('m-0 text-[15px] font-bold leading-none', className)}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-sub', className)} {...props} />
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}

/**
 * The circular/rounded initial that stands in for an account or merchant.
 * `tone` maps to the three fills the design uses for these.
 */
export function Avatar({
  children,
  tone = 'neutral',
  size = 40,
  className,
}: {
  children: React.ReactNode
  tone?: 'brand' | 'gold' | 'neutral'
  size?: number
  className?: string
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-extrabold',
        tone === 'brand' && 'bg-brand-soft text-brand',
        tone === 'gold' && 'bg-gold-soft text-gold-ink',
        tone === 'neutral' && 'bg-soft text-sub',
        className,
      )}
    >
      {children}
    </span>
  )
}
