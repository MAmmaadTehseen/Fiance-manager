import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'

export const emailAccountKeys = {
  current: ['email_account'] as const,
}

export type EmailAccount = {
  id: string
  provider: string
  email_address: string
  last_synced_at: string | null
  connected_at: string
}

/** The connected inbox, if any. Token columns are not granted to the client, so
 *  this only ever returns status, never a credential. */
export function useEmailAccount() {
  return useQuery({
    queryKey: emailAccountKeys.current,
    queryFn: async (): Promise<EmailAccount | null> => {
      const { data, error } = await getSupabase()
        .from('email_accounts')
        .select('id, provider, email_address, last_synced_at, connected_at')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Starts the Gmail OAuth flow. Returns the Google consent URL — the caller
 * sends the browser there (web) or opens it in an auth session (mobile), so
 * this stays platform-agnostic. `redirect` is where Google should land the user
 * back afterwards, carried through the signed state.
 */
export function useConnectGmail() {
  return useMutation({
    mutationFn: async (redirect: string): Promise<string> => {
      const { data, error } = await getSupabase().functions.invoke('gmail-connect', {
        body: { redirect },
      })
      if (error) throw error
      const url = (data as { url?: string } | null)?.url
      if (!url) throw new Error('Could not start Gmail connect')
      return url
    },
  })
}

export function useDisconnectGmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('email_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: emailAccountKeys.current }),
  })
}

export type SyncResult = {
  status?: string
  email?: string
  scanned?: number
  new?: number
  filed?: number
  error?: string
}

/** Pulls the connected inbox now. Refreshes the ledger + inbox on success. */
export function useSyncGmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await getSupabase().functions.invoke('gmail-sync', {
        body: {},
      })
      if (error) throw error
      return data as SyncResult
    },
    // A sync can create transactions and inbox items across the app, so refresh
    // everything rather than guess which query keys were touched.
    onSuccess: () => void qc.invalidateQueries(),
  })
}
