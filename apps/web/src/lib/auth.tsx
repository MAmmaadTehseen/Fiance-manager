import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
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
      setState((prev) => {
        // A different user (or none) means the previous user's cached queries
        // must not survive. Query keys carry no user id and staleTime is 30s,
        // so without this user B briefly sees user A's balances and SMS.
        if (prev.user?.id !== (session?.user?.id ?? null)) {
          queryClient.clear()
        }
        return { session, user: session?.user ?? null, loading: false }
      })
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

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
        // Belt and braces: onAuthStateChange clears too, but do it here so
        // the cache is empty the instant the promise resolves.
        queryClient.clear()
      },

      async resetPassword(email) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/reset-password` },
        )
        if (error) throw error
      },
    }),
    [state, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
