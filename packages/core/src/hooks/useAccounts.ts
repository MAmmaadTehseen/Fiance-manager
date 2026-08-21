import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import type { Account, AccountBalance } from '../types/db'

export const accountKeys = {
  all: ['accounts'] as const,
  balances: ['accounts', 'balances'] as const,
}

/** Accounts with their live computed balance, ordered for display. */
export function useAccountBalances() {
  return useQuery({
    queryKey: accountKeys.balances,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await getSupabase()
        .from('account_balances')
        .select('*')
        .is('archived_at', null)
        .order('is_primary', { ascending: false })
        .order('name')
        .returns<AccountBalance[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await getSupabase()
        .from('accounts')
        .select('*')
        .is('archived_at', null)
        .order('is_primary', { ascending: false })
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export type NewAccount = {
  name: string
  type: Account['type']
  institution?: string | null
  last4?: string | null
  opening_balance?: number
  is_primary?: boolean
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewAccount) => {
      const { data, error } = await getSupabase()
        .from('accounts')
        .insert({
          ...input,
          // Empty string would fail the last4 check constraint.
          last4: input.last4?.trim() || null,
          institution: input.institution?.trim() || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}

export function useArchiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('accounts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}
