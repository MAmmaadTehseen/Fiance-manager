import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ReceiptText,
  Wallet,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Activity', icon: ReceiptText },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-background">
      {/* Bottom nav is the primary control on mobile; on desktop it moves to
          a left rail so the ledger gets the full width. */}
      <div className="mx-auto flex w-full max-w-5xl md:gap-6">
        <nav
          aria-label="Main"
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur',
            'pb-[env(safe-area-inset-bottom)]',
            'md:static md:h-dvh md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-t-0 md:p-3',
          )}
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  'md:w-full md:flex-none md:flex-row md:gap-3 md:rounded-lg md:px-3 md:py-2.5 md:text-sm',
                  isActive
                    ? 'text-primary md:bg-accent md:text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1 pb-24 md:py-6 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
