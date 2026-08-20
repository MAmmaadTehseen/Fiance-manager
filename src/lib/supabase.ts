import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from '@/types/database.types'

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      // The session lives in localStorage so an installed PWA reopens signed
      // in; the biometric gate (Phase 4) sits in front of this, not instead
      // of it.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'finance-manager-auth',
    },
  },
)

/** Narrow helper: the current user's id, or throws. Use inside mutations. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}
