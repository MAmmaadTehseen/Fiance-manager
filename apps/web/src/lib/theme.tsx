import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

/** Shared with the pre-paint script in index.html — keep the two in step. */
export const THEME_STORAGE_KEY = 'batwa-theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  /** True when the choice came from the system rather than the user. */
  isSystem: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    // Private mode, or storage disabled. Falling back to the system
    // preference is better than refusing to render.
    return null
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read back what the pre-paint script already decided, so React's first
  // render agrees with what is on screen instead of overwriting it.
  const [theme, setThemeState] = useState<Theme>(
    () =>
      (document.documentElement.dataset.theme as Theme | undefined) ??
      storedTheme() ??
      'light',
  )
  const [isSystem, setIsSystem] = useState(() => storedTheme() === null)

  const apply = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next
    // Keeps the browser chrome (address bar, notch) in step with the page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#111c18' : '#f5f2e9')
  }, [])

  useEffect(() => apply(theme), [theme, apply])

  // While the user has not chosen, keep following the system.
  useEffect(() => {
    if (!isSystem) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setThemeState(systemTheme())
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [isSystem])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    setIsSystem(false)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Not persisting is survivable; refusing to switch is not.
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      isSystem,
    }),
    [theme, setTheme, isSystem],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
