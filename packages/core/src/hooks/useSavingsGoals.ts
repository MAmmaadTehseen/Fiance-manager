import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import type { SavingsGoal } from '../types/db'

export const savingsGoalKeys = {
  all: ['savings_goals'] as const,
}

export function useSavingsGoals() {
  return useQuery({
    queryKey: savingsGoalKeys.all,
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await getSupabase()
        .from('savings_goals')
        .select('*')
        .order('created_at', { ascending: true })
        .returns<SavingsGoal[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

export type NewSavingsGoal = {
  name: string
  target_amount: number
  target_date?: string | null
  saved_amount?: number
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewSavingsGoal) => {
      const { data, error } = await getSupabase()
        .from('savings_goals')
        .insert({
          name: input.name.trim(),
          target_amount: input.target_amount,
          target_date: input.target_date || null,
          saved_amount: input.saved_amount ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: savingsGoalKeys.all }),
  })
}

/** Edit a goal, or move its saved figure (a contribution). */
export function useUpdateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      target_amount?: number
      target_date?: string | null
      saved_amount?: number
    }) => {
      const { error } = await getSupabase()
        .from('savings_goals')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: savingsGoalKeys.all }),
  })
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('savings_goals')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: savingsGoalKeys.all }),
  })
}
