import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

type SessionState = { session: Session | null; loading: boolean }

export const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
})

export function useSession(): SessionState {
  return useContext(SessionContext)
}
