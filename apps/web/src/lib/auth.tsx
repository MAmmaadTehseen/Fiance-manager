import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '@batwa/core'

type AuthState = {
  session: Session | null
  user: User | null
  /** True until the initial session lookup settles — gate routing on this. */
  loading: boolean
}

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  })

  useEffect(() => {
    let active = true

    getSupabase().auth.getSession().then(({ data }) => {
      if (!active) return
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      })
    })

    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false })
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,

      async signIn(email, password) {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      },

      async signUp(email, password, displayName) {
        const { data, error } = await getSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (error) throw error
        // With email confirmation on, signUp returns a user but no session.
        return { needsConfirmation: !data.session }
      },

      async signOut() {
        const { error } = await getSupabase().auth.signOut()
        if (error) throw error
      },

      async resetPassword(email) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/reset-password` },
        )
        if (error) throw error
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
