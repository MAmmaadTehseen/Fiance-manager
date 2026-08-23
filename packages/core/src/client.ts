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

/**
 * The auth storage key. Renaming it silently signs everyone out, so the web
 * migration below copies the pre-rebrand session across on first load.
 */
const STORAGE_KEY = 'batwa-auth'
const LEGACY_WEB_KEY = 'finance-manager-auth'

function migrateLegacyWebSession() {
  // Only the browser had the old key; React Native used AsyncStorage and a
  // different key never shipped there.
  try {
    const ls = globalThis.localStorage
    if (!ls) return
    if (ls.getItem(STORAGE_KEY)) return
    const legacy = ls.getItem(LEGACY_WEB_KEY)
    if (legacy) {
      ls.setItem(STORAGE_KEY, legacy)
      ls.removeItem(LEGACY_WEB_KEY)
    }
  } catch {
    // Storage disabled/unavailable — the user just signs in again.
  }
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
  // Idempotent: React Native Fast Refresh re-runs module scope, and a second
  // GoTrueClient racing the first over one storage key causes intermittent
  // sign-outs. Return the existing client rather than making a rival.
  if (client && config?.url === next.url && config?.anonKey === next.anonKey) {
    return client
  }

  if (!next.storage) migrateLegacyWebSession()

  config = next
  client = createClient<Database>(next.url, next.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: next.detectSessionInUrl ?? true,
      storageKey: STORAGE_KEY,
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
