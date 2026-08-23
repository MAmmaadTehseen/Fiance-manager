import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ReceiptText,
  Inbox,
  Wallet,
  PieChart,
  Target,
  Settings,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInboxCount } from '@batwa/core'
import { BatwaLogo, BatwaWordmark } from '@/components/BatwaLogo'
import { TransactionForm } from '@/features/transactions/TransactionForm'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Activity', icon: ReceiptText },
  { to: '/inbox', label: 'Inbox', icon: Inbox, badge: true },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full bg-gold font-bold text-gold-on',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

/**
 * The app shell.
 *
 * Three layouts, matching the design's breakpoints exactly:
 *   < 640px   bottom tab bar + a compact branded header
 *   640-1023  a 74px icon rail
 *   >= 1024   the full 236px sidebar
 *
 * All three are rendered and shown/hidden with CSS rather than switched on a
 * measured window width. A resize listener would re-render the whole tree on
 * every frame of a drag, and would render the wrong nav on the first paint
 * after hydration.
 *
 * The theme toggle deliberately lives in Settings only — not here.
 */
export function AppLayout() {
  const { data: inboxCount = 0 } = useInboxCount()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* ------------------------------------------------ sidebar (>=1024) */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col gap-1.5 border-r border-line px-4 py-6 lg:flex"
      >
        <div className="flex items-center gap-2.5 px-2.5 pb-[22px] pt-1">
          <BatwaLogo size={34} />
          <BatwaWordmark className="text-[21px]" />
        </div>

        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex w-full items-center gap-3 rounded-xl px-3.5 py-[11px] text-left text-[14.5px] transition-colors',
                isActive
                  ? 'bg-brand font-bold text-brand-on'
                  : 'font-semibold text-sub hover:bg-soft hover:text-ink',
              )
            }
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {label}
            {badge && (
              <Badge
                count={inboxCount}
                className="ml-auto px-2 py-0.5 text-[11px]"
              />
            )}
          </NavLink>
        ))}

        <div className="mt-auto flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[46px] items-center justify-center gap-2 rounded-[13px] bg-gold text-[14.5px] font-bold text-gold-on transition hover:brightness-105"
          >
            <Plus className="size-[17px]" aria-hidden />
            Add transaction
          </button>
        </div>
      </nav>

      {/* --------------------------------------------------- rail (640-1023) */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-[74px] shrink-0 flex-col items-center gap-2 border-r border-line px-3 py-5 sm:flex lg:hidden"
      >
        <BatwaLogo size={36} className="mb-3.5" />

        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              cn(
                'relative flex size-[46px] items-center justify-center rounded-[13px] transition-colors',
                isActive
                  ? 'bg-brand text-brand-on'
                  : 'text-sub hover:bg-soft hover:text-ink',
              )
            }
          >
            <Icon className="size-[19px]" aria-hidden />
            <span className="sr-only">{label}</span>
            {badge && (
              <Badge
                count={inboxCount}
                className="absolute -right-0.5 -top-0.5 size-[17px] text-[9.5px]"
              />
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add transaction"
          className="mt-auto flex size-[46px] items-center justify-center rounded-[14px] bg-gold text-gold-on transition hover:brightness-105"
        >
          <Plus className="size-5" aria-hidden />
          <span className="sr-only">Add transaction</span>
        </button>
      </nav>

      {/* --------------------------------------------------------------- main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* mobile header (<640) */}
        <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-background px-4 py-3.5 pt-[max(14px,env(safe-area-inset-top))] sm:hidden">
          <BatwaLogo size={30} />
          <BatwaWordmark className="text-[19px]" />
        </header>

        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-[clamp(20px,3vw,32px)] p-[clamp(16px,3.5vw,40px)] pb-[calc(76px+env(safe-area-inset-bottom))] sm:pb-[clamp(16px,3.5vw,40px)]">
          <Outlet />
        </div>
      </main>

      {/* ------------------------------------------------ bottom tabs (<640) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around gap-0.5 border-t border-line bg-card px-[max(8px,env(safe-area-inset-left))] pb-[max(10px,env(safe-area-inset-bottom))] pt-2 sm:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-[3px] rounded-[10px] px-0.5 py-1.5 transition-colors',
                isActive ? 'text-brand' : 'text-sub',
              )
            }
          >
            <span className="relative flex">
              <Icon className="size-[21px]" aria-hidden />
              {badge && (
                <Badge
                  count={inboxCount}
                  className="absolute -right-1.5 -top-[3px] size-[15px] text-[9.5px]"
                />
              )}
            </span>
            <span className="text-[10.5px] font-bold">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Floating add button on mobile, where the nav has no room for it. */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="Add transaction"
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-2xl bg-gold text-gold-on shadow-card transition hover:brightness-105 sm:hidden"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  )
}
