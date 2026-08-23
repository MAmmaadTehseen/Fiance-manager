import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import type { Budget } from '../types/db'

export const budgetKeys = {
  all: ['budgets'] as const,
}

/** A budget with the category it limits, for rendering a row. */
export type BudgetRow = Budget & {
  category: { id: string; name: string; icon: string | null; kind: string } | null
}

export function useBudgets() {
  return useQuery({
    queryKey: budgetKeys.all,
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await getSupabase()
        .from('budgets')
        .select('*, category:categories (id, name, icon, kind)')
        .returns<BudgetRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Set or change the monthly limit for a category. One budget per category, so
 * this upserts on (user_id, category_id) — user_id falls to its auth.uid()
 * default on insert.
 */
export function useUpsertBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      categoryId,
      amount,
    }: {
      categoryId: string
      amount: number
    }) => {
      const { error } = await getSupabase()
        .from('budgets')
        .upsert(
          {
            category_id: categoryId,
            amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,category_id' },
        )
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: budgetKeys.all }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('budgets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: budgetKeys.all }),
  })
}
