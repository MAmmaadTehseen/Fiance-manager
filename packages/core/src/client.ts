import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types/database.types'

export type BatwaClient = SupabaseClient<Database>

export type SupabaseConfig = {
  url: string
  anonKey: string
  /**
   * Where the session is kept. Web leaves this undefined and gets
   * localStorage; React Native passes AsyncStorage, which has no default.
   */
  storage?: {
    getItem: (key: string) => string | null | Promise<string | null>
    setItem: (key: string, value: string) => void | Promise<void>
    removeItem: (key: string) => void | Promise<void>
  }
  /**
   * Only a browser can complete an OAuth/magic-link redirect by reading the
   * URL, and React Native has no URL to read.
   */
  detectSessionInUrl?: boolean
}

let client: BatwaClient | null = null
let config: SupabaseConfig | null = null

/**
 * Called once at app startup, before any hook runs.
 *
 * The client is a module singleton rather than a React context because the
 * hooks are plain functions used all over the tree, and threading a provider
 * through both apps buys nothing when there is only ever one client.
 */
export function initSupabase(next: SupabaseConfig): BatwaClient {
  config = next
  client = createClient<Database>(next.url, next.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: next.detectSessionInUrl ?? true,
      storageKey: 'batwa-auth',
      ...(next.storage ? { storage: next.storage } : {}),
    },
  })
  return client
}

export function getSupabase(): BatwaClient {
  if (!client) {
    throw new Error('initSupabase() must be called before using the client')
  }
  return client
}

/** The deployed project URL — used to build the SMS ingest webhook address. */
export function getSupabaseUrl(): string {
  if (!config) throw new Error('initSupabase() has not been called')
  return config.url
}

/** Narrow helper: the current user's id, or throws. Use inside mutations. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}
