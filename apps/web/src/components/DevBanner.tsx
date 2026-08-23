import { isProductionDeploy } from '@/lib/env'

/**
 * A standing marker that this is not production.
 *
 * It renders on every non-production build — dev.batwa.online, a preview, a
 * local stack — so a screen full of test data is never mistaken for the real
 * ledger. On production it renders nothing. `pointer-events-none` means it
 * floats over the UI without ever intercepting a click.
 */
export function DevBanner() {
  if (isProductionDeploy) return null

  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const label =
    host === 'localhost' || host.startsWith('127.') ? 'LOCAL' : 'DEV'

  return (
    <div
      role="status"
      aria-label={`${label} environment — separate from production data`}
      className="pointer-events-none fixed left-1/2 top-2 z-[100] -translate-x-1/2 rounded-full bg-[var(--gold)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--gold-on)] shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
    >
      {label} · separate data
    </div>
  )
}
