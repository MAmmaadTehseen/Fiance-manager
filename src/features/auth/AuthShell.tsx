import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { BatwaLogo, BatwaWordmark } from '@/components/BatwaLogo'
import { useTheme } from '@/lib/theme'

/**
 * Shared frame for the signed-out screens.
 *
 * Carries its own back link and theme toggle: there is no app shell out here,
 * so without them someone who lands straight on /sign-in has no way back to
 * the homepage and no way to change the theme.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-5 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-[11px] border border-line px-3 py-2 text-sm font-semibold text-sub no-underline transition-colors hover:bg-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={dark}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto flex size-[38px] items-center justify-center rounded-[11px] border border-line text-sub transition-colors hover:bg-soft hover:text-ink"
        >
          {dark ? (
            <Sun className="size-[17px]" aria-hidden />
          ) : (
            <Moon className="size-[17px]" aria-hidden />
          )}
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center px-5 pb-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <Link
              to="/"
              className="mb-6 flex items-center gap-2.5 no-underline"
              aria-label="Batwa home"
            >
              <BatwaLogo size={34} />
              <BatwaWordmark className="text-[21px]" />
            </Link>

            <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mb-0 mt-1.5 text-sm text-sub">{subtitle}</p>
          </div>

          {children}

          <p className="mt-6 text-center text-sm text-sub">{footer}</p>
        </div>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  )
}
