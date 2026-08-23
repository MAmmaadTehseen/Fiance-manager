import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { BatwaLogo, BatwaWatermark, BatwaWordmark } from '@/components/BatwaLogo'

/**
 * The public homepage.
 *
 * Only ever rendered signed-out; once there's a session, `/` is the dashboard.
 *
 * The palette is scoped to `.batwa` (see index.css) rather than `:root`, so
 * this warm, light-only brand cannot leak into the app's own theme — which is
 * cool-toned and follows the system light/dark preference.
 */

const STEPS = [
  {
    n: '01',
    title: 'Connect your phone',
    body: 'Install the tiny companion on your Android. It watches for bank SMS only — nothing else.',
  },
  {
    n: '02',
    title: 'Batwa reads the SMS',
    body: 'Amount, merchant, account and a suggested category — parsed from Meezan, HBL, JazzCash, Easypaisa and more.',
  },
  {
    n: '03',
    title: 'You confirm',
    body: 'One tap in the inbox and it joins your ledger. Cash spending? Add it in five seconds.',
  },
]

const FEATURES = [
  {
    title: 'One clear overview',
    body: 'Total balance, six-month trend and where the money went — on one screen, in rupees.',
    icon: (
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>
    ),
  },
  {
    title: 'Banks, wallets, cash',
    body: 'Meezan next to JazzCash next to the notes in your pocket. Transfers between them stay tidy.',
    icon: (
      <>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  {
    title: 'Private by design',
    body: 'Your ingest token is created on your device and never stored by us. Your data is yours alone.',
    icon: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
  {
    title: 'Works as an app',
    body: 'Install it from the browser — home screen icon, offline-friendly, light and dark.',
    icon: (
      <>
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="m4.93 4.93 2.83 2.83" />
        <path d="m16.24 16.24 2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="m4.93 19.07 2.83-2.83" />
        <path d="m16.24 7.76 2.83-2.83" />
      </>
    ),
  },
]

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-[42px] items-center justify-center rounded-[13px] bg-[var(--gold-soft)] text-[var(--gold-ink)]">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </span>
  )
}

const SHELL = 'mx-auto w-full max-w-[1160px] px-[clamp(16px,4vw,32px)]'
const PRIMARY_BTN =
  'rounded-[14px] bg-[var(--brand)] px-6 py-[14px] text-[15px] font-bold text-[var(--brand-on)] no-underline transition hover:brightness-110'

export function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="min-h-dvh bg-[var(--bg)] font-[family-name:var(--font-sans)] text-[var(--ink)]">
      {/* ---------------------------------------------------------- header */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-background/85 backdrop-blur-[10px]">
        <div className={`${SHELL} flex items-center gap-3 py-[14px]`}>
          <BatwaLogo size={32} />
          <BatwaWordmark className="text-xl" />

          <nav className="ml-auto flex items-center gap-[clamp(10px,2vw,22px)]">
            <a
              href="#how"
              className="text-sm font-semibold text-[var(--sub)] no-underline transition hover:text-[var(--ink)]"
            >
              How it works
            </a>
            <Link
              to="/download"
              className="text-sm font-semibold text-[var(--sub)] no-underline transition hover:text-[var(--ink)]"
            >
              Get the app
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={dark}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
              className="flex size-[38px] items-center justify-center rounded-[11px] border border-[var(--line)] text-[var(--sub)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--ink)]"
            >
              {dark ? (
                <Sun className="size-[17px]" aria-hidden />
              ) : (
                <Moon className="size-[17px]" aria-hidden />
              )}
            </button>
            <Link
              to="/sign-in"
              className="rounded-[11px] bg-[var(--brand)] px-4 py-[9px] text-sm font-bold text-[var(--brand-on)] no-underline transition hover:brightness-110"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section
        className={`${SHELL} grid items-center gap-[clamp(28px,5vw,64px)] pb-[clamp(32px,6vw,72px)] pt-[clamp(40px,8vw,96px)]`}
        style={{
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))',
        }}
      >
        <div className="flex flex-col gap-5">
          <span className="self-start rounded-full bg-[var(--gold-soft)] px-3 py-1.5 text-[12.5px] font-bold tracking-[0.04em] text-[var(--gold-ink)]">
            PKR-FIRST · MADE FOR PAKISTAN
          </span>

          <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-pretty">
            Your bank texts.
            <br />
            Batwa keeps the ledger.
          </h1>

          <p className="m-0 max-w-[480px] text-[clamp(15px,2vw,18px)] leading-[1.6] text-[var(--sub)] text-pretty">
            Every Meezan, JazzCash and Easypaisa SMS your phone gets becomes a
            clean, categorised transaction — automatically. You just confirm.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to="/sign-up" className={PRIMARY_BTN}>
              Start free
            </Link>
            <Link
              to="/download"
              className="rounded-[14px] border border-[var(--line)] bg-[var(--card-bg)] px-6 py-[14px] text-[15px] font-bold text-[var(--ink)] no-underline transition hover:bg-[var(--soft)]"
            >
              Get the Android app
            </Link>
          </div>

          <p className="mb-0 mt-1 text-[13px] text-[var(--sub)]">
            Free while in beta · SMS never leaves your phone unencrypted
          </p>
        </div>

        {/* --- preview cards --- */}
        <div className="flex min-w-0 flex-col gap-[14px]">
          <div className="relative overflow-hidden rounded-[26px] bg-[var(--brand)] p-[clamp(22px,4vw,30px)] text-[var(--brand-on)] shadow-[var(--shadow)]">
            <BatwaWatermark
              size={180}
              className="absolute -bottom-[50px] -right-[40px] opacity-[0.12]"
            />
            <p className="m-0 text-[13px] font-semibold opacity-75">
              Total balance
            </p>
            <p className="mb-0 mt-1.5 font-[family-name:var(--font-display)] text-[clamp(34px,5vw,44px)] font-bold tabular-nums tracking-[-0.02em]">
              Rs 412,350
            </p>
            <div className="mt-[18px] flex flex-wrap gap-7">
              <span className="text-sm font-bold text-[oklch(0.85_0.1_155)]">
                +Rs 285,000 in
              </span>
              <span className="text-sm font-bold text-[var(--gold)]">
                −Rs 96,420 out
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--card-bg)] px-[18px] py-4 shadow-[var(--shadow)]">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-[var(--gold-soft)] font-bold text-[var(--gold-ink)]">
              F
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                Foodpanda · −Rs 1,640
              </span>
              <span className="block truncate text-[12.5px] text-[var(--sub)]">
                Parsed from Meezan SMS · Food &amp; dining
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--brand)] px-[13px] py-[7px] text-xs font-bold text-[var(--brand-on)]">
              Confirm
            </span>
          </div>

          <div className="mr-[clamp(0px,6vw,56px)] flex items-center gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--card-bg)] px-[18px] py-4 shadow-[var(--shadow)]">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-pos/[0.12] text-[var(--pos)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                JazzCash +Rs 5,000 added
              </span>
              <span className="block text-[12.5px] text-[var(--sub)]">
                No typing. No spreadsheets.
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- how it works */}
      <section
        id="how"
        className="bg-[var(--brand-deep)] text-[var(--brand-on)]"
      >
        <div
          className={`${SHELL} flex flex-col gap-[clamp(28px,4vw,44px)] py-[clamp(48px,7vw,88px)]`}
        >
          <div className="max-w-[560px]">
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(26px,4vw,40px)] font-bold tracking-[-0.02em]">
              Three steps, then it runs itself
            </h2>
            <p className="mb-0 mt-2.5 text-[15.5px] leading-[1.6] opacity-75">
              Set up once in two minutes. After that, your ledger writes itself
              every time your bank texts you.
            </p>
          </div>

          <div
            className="grid gap-[clamp(14px,2vw,24px)]"
            style={{
              gridTemplateColumns:
                'repeat(auto-fit,minmax(min(100%,260px),1fr))',
            }}
          >
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex flex-col gap-3 rounded-[22px] border border-[oklch(1_0_0/0.12)] bg-[oklch(1_0_0/0.06)] p-[26px]"
              >
                <span className="font-[family-name:var(--font-display)] text-[15px] font-extrabold text-[var(--gold)]">
                  {s.n}
                </span>
                <h3 className="m-0 text-lg font-bold">{s.title}</h3>
                <p className="m-0 text-[14.5px] leading-[1.6] opacity-75">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section
        className={`${SHELL} flex flex-col gap-[clamp(28px,4vw,44px)] py-[clamp(48px,7vw,88px)]`}
      >
        <div className="max-w-[560px]">
          <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(26px,4vw,40px)] font-bold tracking-[-0.02em]">
            Everything a batwa should hold
          </h2>
        </div>

        <div
          className="grid gap-[clamp(14px,2vw,20px)]"
          style={{
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,250px),1fr))',
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-2.5 rounded-[22px] border border-[var(--line)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)]"
            >
              <FeatureIcon>{f.icon}</FeatureIcon>
              <h3 className="m-0 text-[16.5px] font-bold">{f.title}</h3>
              <p className="m-0 text-sm leading-[1.6] text-[var(--sub)]">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className={`${SHELL} pb-[clamp(48px,7vw,88px)]`}>
        <div className="flex flex-col items-center gap-[18px] rounded-[28px] bg-[var(--gold)] p-[clamp(32px,6vw,56px)] text-center">
          <BatwaLogo size={52} />
          <h2 className="m-0 max-w-[560px] font-[family-name:var(--font-display)] text-[clamp(26px,4.5vw,42px)] font-extrabold tracking-[-0.02em] text-gold-on text-pretty">
            Stop guessing where the month went.
          </h2>
          <Link
            to="/sign-up"
            className="rounded-[14px] bg-[var(--brand)] px-7 py-[15px] text-[15.5px] font-bold text-[var(--brand-on)] no-underline transition hover:brightness-110"
          >
            Open Batwa free
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="border-t border-[var(--line)]">
        <div className={`${SHELL} flex flex-wrap items-center gap-3 py-6`}>
          <BatwaLogo size={24} />
          <span className="text-[13.5px] text-[var(--sub)]">
            batwa · بٹوہ — your money, kept.
          </span>
          <span className="ml-auto text-[13px] text-[var(--sub)]">
            © 2026 Batwa
          </span>
        </div>
      </footer>
    </div>
  )
}
