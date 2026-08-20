import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({
  className,
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        // 16px text on mobile stops iOS zooming the viewport on focus.
        'flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-base',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
