import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { catchUpWaiting } from './catchUp'
import type { Account, AccountBalance, AccountUpdate } from '../types/db'

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

      // An account is usually added *because* messages quoting it are already
      // sitting in the Inbox unclaimed. Supplying the digits is the answer to
      // that question, so those messages should not still be asking it.
      if (data?.last4) await catchUpWaiting({ last4: data.last4 })
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}

/** The editable face of an account. Everything here is a correction of a fact. */
export type AccountEdit = {
  id: string
  name?: string
  type?: Account['type']
  institution?: string | null
  last4?: string | null
  opening_balance?: number
  is_primary?: boolean
  sms_senders?: string[]
}

/**
 * Turns a database complaint about an account into a sentence.
 *
 * Two of the three rules a person can break here are enforced by indexes, so
 * without this the user is shown `accounts_user_last4_uniq`.
 */
function accountError(error: { code?: string; message: string }): Error {
  const m = error.message
  if (error.code === '23505' && m.includes('last4'))
    return new Error('Another account already ends in those digits.')
  if (error.code === '23505' && m.includes('primary'))
    return new Error('Only one account can be the main one.')
  if (error.code === '23514' && m.includes('last4'))
    return new Error('The last digits should be 3 to 6 numbers.')
  if (error.code === '23514' && m.includes('name'))
    return new Error('Give the account a name.')
  return new Error(m)
}

/**
 * Correcting an account after the fact.
 *
 * Accounts were create-only, which made a typo permanent: a wrong `last4`
 * quietly sends every future bank message to the review Inbox instead of the
 * account it belongs to, and there was no way to fix it.
 *
 * The main-account flag is handled last and separately. Only one account may
 * be primary, so promoting this one means demoting the others first — and
 * doing that before the rest of the edit is validated would leave the user
 * with no primary at all if the edit then failed on a duplicate last4.
 */
export function useUpdateAccount() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, is_primary, ...patch }: AccountEdit) => {
      const db = getSupabase()

      const fields: AccountUpdate = { ...patch }
      if (patch.name !== undefined) fields.name = patch.name.trim()
      // Empty means "no digits", not an empty string the check would reject.
      if (patch.last4 !== undefined) fields.last4 = patch.last4?.trim() || null
      if (patch.institution !== undefined)
        fields.institution = patch.institution?.trim() || null

      if (Object.keys(fields).length > 0) {
        const { error } = await db.from('accounts').update(fields).eq('id', id)
        if (error) throw accountError(error)
      }

      if (is_primary) {
        const { error: demoteError } = await db
          .from('accounts')
          .update({ is_primary: false })
          .eq('is_primary', true)
          .neq('id', id)
        if (demoteError) throw accountError(demoteError)
      }
      if (is_primary !== undefined) {
        const { error } = await db
          .from('accounts')
          .update({ is_primary })
          .eq('id', id)
        if (error) throw accountError(error)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}

/** What happened when an account was removed, so the UI can say which. */
export type AccountRemoval = { deleted: boolean; transactions: number }

/**
 * Removes an account — really deleting it when that is honest, archiving it
 * when it is not.
 *
 * An account someone added by mistake should disappear completely; leaving a
 * tombstone for a row that never held anything is clutter with no upside. But
 * an account with history cannot go: its transactions are real events, the
 * database refuses the delete outright (`on delete restrict`), and removing
 * them to force it through would silently rewrite past months. So it is
 * archived — hidden everywhere an account is listed, with the ledger intact.
 *
 * Both legs of a transfer are counted. An account can be untouched as the
 * source and still be the destination of every transfer you ever made.
 */
export function useRemoveAccount() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<AccountRemoval> => {
      const db = getSupabase()

      const { count, error: countError } = await db
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .or(`account_id.eq.${id},counterparty_account_id.eq.${id}`)
      if (countError) throw countError

      const used = count ?? 0
      if (used === 0) {
        const { error } = await db.from('accounts').delete().eq('id', id)
        if (error) throw error
        return { deleted: true, transactions: 0 }
      }

      const { error } = await db
        .from('accounts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { deleted: false, transactions: used }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      void qc.invalidateQueries({ queryKey: accountKeys.balances })
    },
  })
}
