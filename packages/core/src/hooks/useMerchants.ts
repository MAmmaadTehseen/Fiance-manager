import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { categoryKeys } from './useCategories'
import { transactionKeys } from './useTransactions'

export const merchantKeys = {
  all: ['merchants'] as const,
}

/** A payee as the management screen needs it. */
export type MerchantSummary = {
  id: string
  display_name: string
  raw_name: string
  times_seen: number
  last_seen_at: string | null
  default_category_id: string | null
  category: { id: string; name: string } | null
}

/**
 * Every canonical payee — aliases are folded away, since to the user a merged
 * name simply IS the shop it was merged into.
 */
export function useMerchants() {
  return useQuery({
    queryKey: merchantKeys.all,
    queryFn: async (): Promise<MerchantSummary[]> => {
      const { data, error } = await getSupabase()
        .from('merchants')
        .select(
          'id, display_name, raw_name, times_seen, last_seen_at, default_category_id, category:categories (id, name)',
        )
        .is('merged_into', null)
        .order('times_seen', { ascending: false })
        .returns<MerchantSummary[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Folds several payees into one.
 *
 * The alias rows stay — each is the match key for future messages, and the
 * pipeline follows `merged_into` one hop — but everything user-facing moves:
 * history is repointed so per-person totals unify, and if the canonical payee
 * already knows its category, transactions the aliases left waiting are filed
 * with it. Teaching any name after this teaches the shop, because there is
 * only one `default_category_id` left that matters.
 */
export function useMergeMerchants() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      intoId,
      aliasIds,
    }: {
      intoId: string
      aliasIds: string[]
    }) => {
      const ids = aliasIds.filter((id) => id !== intoId)
      if (ids.length === 0) throw new Error('Pick at least two payees to merge.')
      const db = getSupabase()

      const { data: canonical, error: canonicalError } = await db
        .from('merchants')
        .select('id, default_category_id')
        .eq('id', intoId)
        .single()
      if (canonicalError) throw canonicalError

      // If the survivor has no taught category yet, inherit one from an alias
      // rather than losing what the user already taught under the other name.
      if (!canonical.default_category_id) {
        const { data: taught } = await db
          .from('merchants')
          .select('default_category_id')
          .in('id', ids)
          .not('default_category_id', 'is', null)
          .limit(1)
          .maybeSingle()
        if (taught?.default_category_id) {
          const { error } = await db
            .from('merchants')
            .update({ default_category_id: taught.default_category_id })
            .eq('id', intoId)
          if (error) throw error
          canonical.default_category_id = taught.default_category_id
        }
      }

      const { error: pointError } = await db
        .from('merchants')
        .update({ merged_into: intoId })
        .in('id', ids)
      if (pointError) throw pointError

      const { error: repointError } = await db
        .from('transactions')
        .update({ merchant_id: intoId })
        .in('merchant_id', ids)
      if (repointError) throw repointError

      // The same catch-up filing does after a merge what it does after
      // teaching: nothing the shop is known for should stay in the Inbox.
      if (canonical.default_category_id) {
        const { error: fileError } = await db
          .from('transactions')
          .update({
            category_id: canonical.default_category_id,
            status: 'cleared',
          })
          .eq('merchant_id', intoId)
          .eq('status', 'needs_review')
          .eq('type', 'expense')
        if (fileError) throw fileError
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: merchantKeys.all })
      void qc.invalidateQueries({ queryKey: transactionKeys.all })
      void qc.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}
