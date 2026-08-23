/**
 * App-wide theme, with an override the user controls in Settings.
 *
 * The web app stores a light/dark/system preference; the phone should match, so
 * this holds the same three states. `system` follows the OS via
 * useColorScheme; an explicit choice wins until cleared. The preference is
 * persisted in AsyncStorage so it survives a restart, and every screen reads
 * colours through this context rather than computing them from the OS directly
 * — otherwise toggling dark mode in Settings would leave half the app behind.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { palette, resolveScheme, type Colors, type Scheme } from './theme'

type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'batwa-theme'

type ThemeState = {
  scheme: Scheme
  colors: Colors
  pref: ThemePref
  isSystem: boolean
  toggleTheme: () => void
  setPref: (pref: ThemePref) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = resolveScheme(useColorScheme())
  const [pref, setPrefState] = useState<ThemePref>('system')

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (!active) return
      if (value === 'light' || value === 'dark' || value === 'system') {
        setPrefState(value)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const scheme: Scheme = pref === 'system' ? system : pref
  const colors = palette[scheme]

  function setPref(next: ThemePref) {
    setPrefState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }

  function toggleTheme() {
    setPref(scheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider
      value={{
        scheme,
        colors,
        pref,
        isSystem: pref === 'system',
        toggleTheme,
        setPref,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider')
  return ctx
}

/** Shorthand for the common case — a screen only needs the palette. */
export function useColors(): Colors {
  return useTheme().colors
}
