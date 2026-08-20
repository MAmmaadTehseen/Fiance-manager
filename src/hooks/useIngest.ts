import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { generateIngestToken, sha256Hex } from '@/lib/tokens'
import { transactionKeys } from './useTransactions'
import { accountKeys } from './useAccounts'
import type { IngestToken } from '@/types/db'

export const ingestKeys = {
  tokens: ['ingest', 'tokens'] as const,
  messages: ['ingest', 'messages'] as const,
}

export const webhookUrl = `${env.supabaseUrl}/functions/v1/sms-ingest`

export function useIngestTokens() {
  return useQuery({
    queryKey: ingestKeys.tokens,
    queryFn: async (): Promise<IngestToken[]> => {
      const { data, error } = await supabase
        .from('ingest_tokens')
        .select('*')
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Returns the raw token exactly once. It is not recoverable afterwards — only
 * the hash reaches the database.
 */
export function useCreateIngestToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (label: string): Promise<{ token: string }> => {
      const token = generateIngestToken()
      const { error } = await supabase
        .from('ingest_tokens')
        .insert({ token_hash: await sha256Hex(token), label: label.trim() })
      if (error) throw error
      return { token }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ingestKeys.tokens }),
  })
}

export function useRevokeIngestToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ingest_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ingestKeys.tokens }),
  })
}

export type ReprocessSummary = {
  processed: number
  summary?: Record<string, number>
}

/**
 * Replays messages that are still waiting on a rule or an account. This is
 * what makes "nothing is ever dropped" true in practice.
 */
export function useReprocess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId?: string): Promise<ReprocessSummary> => {
      const { data, error } = await supabase.functions.invoke('sms-reprocess', {
        body: messageId ? { message_id: messageId } : {},
      })
      if (error) throw error
      return data as ReprocessSummary
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ingestKeys.messages })
      void qc.invalidateQueries({ queryKey: transactionKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}
