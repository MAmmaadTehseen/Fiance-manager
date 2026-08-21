import { LogOut, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { ConnectPhone } from './ConnectPhone'

const CARD =
  'rounded-[22px] border border-line bg-card p-[22px] shadow-card'

function initialOf(name: string | null | undefined, email: string | undefined) {
  return (name?.trim()?.[0] ?? email?.[0] ?? '?').toUpperCase()
}

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme, isSystem } = useTheme()
  const dark = theme === 'dark'

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ?? null

  return (
    <div className="flex flex-col gap-[clamp(20px,3vw,28px)]">
      <PageHeader title="Settings" />

      {/* ------------------------------------------------------------ who */}
      <div className={`${CARD} flex items-center gap-3.5`}>
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand font-display text-lg font-extrabold text-brand-on">
          {initialOf(displayName, user?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15.5px] font-bold">
            {displayName ?? 'Your account'}
          </p>
          <p className="mb-0 mt-0.5 truncate text-[13.5px] text-sub">
            {user?.email}
          </p>
        </div>
      </div>

      {/* -------------------------------------------------- phone connection */}
      <ConnectPhone />

      {/* ----------------------------------------------------- appearance */}
      {/* The theme control lives here and only here — not in the sidebar. */}
      <div className={`${CARD} flex items-center gap-3.5`}>
        <div className="flex-1">
          <h2 className="m-0 text-[15.5px] font-bold">Appearance</h2>
          <p className="mb-0 mt-[3px] text-[13.5px] text-sub">
            {dark
              ? 'Dark — easy on late-night ledger checks.'
              : 'Light — the default cream look.'}
            {isSystem && ' Following your device.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={dark}
          className="flex h-10 shrink-0 items-center gap-2 rounded-[11px] border border-line bg-soft px-[18px] text-[13.5px] font-bold text-ink transition hover:brightness-[0.97]"
        >
          {dark ? (
            <Sun className="size-4" aria-hidden />
          ) : (
            <Moon className="size-4" aria-hidden />
          )}
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* ------------------------------------------------------- sign out */}
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex h-[46px] items-center justify-center gap-[9px] rounded-[14px] border border-line bg-card text-sm font-bold text-neg transition hover:brightness-[0.98]"
      >
        <LogOut className="size-[17px]" aria-hidden />
        Sign out
      </button>
    </div>
  )
}
