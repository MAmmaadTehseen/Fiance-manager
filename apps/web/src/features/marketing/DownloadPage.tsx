import { Link } from 'react-router-dom'
import { ArrowLeft, Moon, Sun, Smartphone, ShieldCheck, Bell } from 'lucide-react'
import { BatwaLogo, BatwaWordmark } from '@/components/BatwaLogo'
import { useTheme } from '@/lib/theme'

/**
 * One stable address to share.
 *
 * The Android app is distributed outside the Play Store, so the install link
 * changes with every build. Pointing people — and the app's own update banner
 * — at this page instead means the address they saved keeps working.
 */

// Updated on each release. The app compares its version against
// public/app-version.json and links here when a new build exists.
const ANDROID_BUILD_URL =
  'https://expo.dev/artifacts/eas/RWw1ELuaX5DW2kiH6Yvx7As7srXn5_3eiDXBTE5PT9o.apk'

const STEPS = [
  {
    icon: Smartphone,
    title: 'Install it',
    body: 'Android will ask you to allow installing from an unknown source. That prompt is normal for an app outside the Play Store — allow it once.',
  },
  {
    icon: ShieldCheck,
    title: 'Sign in and connect',
    body: 'Sign in with the account you made here, then tap Connect this phone. Batwa asks for SMS permission and stores a key on your device — the key never leaves it.',
  },
  {
    icon: Bell,
    title: 'Make it reliable',
    body: 'Set battery usage to unrestricted. On Xiaomi, Oppo, Vivo and Samsung, aggressive battery managers are the usual reason a message goes missing.',
  },
]

export function DownloadPage() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="min-h-dvh bg-[var(--bg)] font-[family-name:var(--font-sans)] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-background/85 backdrop-blur-[10px]">
        <div className="mx-auto flex w-full max-w-[1160px] items-center gap-3 px-[clamp(16px,4vw,32px)] py-[14px]">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BatwaLogo size={32} />
            <BatwaWordmark className="text-xl" />
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto flex size-[38px] items-center justify-center rounded-[11px] border border-[var(--line)] text-[var(--sub)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--ink)]"
          >
            {dark ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-[clamp(16px,4vw,32px)] py-[clamp(32px,6vw,72px)]">
        <div className="flex flex-col gap-4">
          <Link
            to="/"
            className="flex w-fit items-center gap-2 text-sm font-semibold text-[var(--sub)] no-underline hover:text-[var(--ink)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>

          <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(30px,5vw,48px)] font-extrabold tracking-[-0.03em] text-pretty">
            Get Batwa for Android
          </h1>
          <p className="m-0 max-w-[520px] text-[clamp(15px,2vw,18px)] leading-[1.6] text-[var(--sub)] text-pretty">
            The app forwards your bank SMS to your ledger automatically — even
            when it&rsquo;s closed. Anything captured without signal is kept and
            sent once you&rsquo;re back online.
          </p>

          <a
            href={ANDROID_BUILD_URL}
            className="w-fit rounded-[14px] bg-[var(--brand)] px-6 py-[14px] text-[15px] font-bold text-[var(--brand-on)] no-underline transition hover:brightness-110"
          >
            Download the APK
          </a>
          <p className="m-0 text-[13px] text-[var(--sub)]">
            Android only. Free while in beta.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gold-soft)] text-[var(--gold-ink)]">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-[16px] font-bold">{title}</h2>
                <p className="mb-0 mt-1 text-sm leading-[1.6] text-[var(--sub)]">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--soft)] p-5">
          <h2 className="m-0 text-[16px] font-bold">On an iPhone?</h2>
          <p className="mb-0 mt-1 text-sm leading-[1.6] text-[var(--sub)]">
            iOS has no way for any app to read SMS, so automatic capture is
            Android-only — that&rsquo;s Apple&rsquo;s rule, not ours. Open{' '}
            <Link to="/" className="font-semibold">
              batwa.online
            </Link>{' '}
            in Safari and add it to your home screen: you get the whole app,
            and add cash spending by hand.
          </p>
        </div>
      </main>
    </div>
  )
}
