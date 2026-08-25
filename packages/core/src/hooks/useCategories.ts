import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import type { Category, CategoryKind } from '../types/db'

export const categoryKeys = {
  all: ['categories'] as const,
  byKind: (kind: CategoryKind) => ['categories', kind] as const,
}

export function useCategories(kind?: CategoryKind) {
  return useQuery({
    queryKey: kind ? categoryKeys.byKind(kind) : categoryKeys.all,
    // Categories change rarely; keep them warm across the session.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      let q = getSupabase()
        .from('categories')
        .select('*')
        .is('archived_at', null)
        .order('sort_order')
        .order('name')
      if (kind) q = q.eq('kind', kind)

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}


/**
 * Adds a category of the user's own.
 *
 * The seeded list is a starting point, not the vocabulary someone has to live
 * inside — what a person tracks is personal, and a spend they cannot name ends
 * up mis-filed or left in the Inbox forever.
 *
 * `user_id` is left to the column default (`auth.uid()`), so a category cannot
 * be created against somebody else's account even if the caller tries. Sorted
 * last by default, keeping the familiar seeded order stable at the top.
 */
export function useCreateCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      kind = 'expense',
    }: {
      name: string
      kind?: CategoryKind
    }): Promise<Category> => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Give the category a name.')

      const { data, error } = await getSupabase()
        .from('categories')
        .insert({ name: trimmed, kind, sort_order: 999 })
        .select()
        .single()

      if (error) {
        // The unique index is per (user, name, kind), so this means they
        // already have one by that name — worth saying plainly rather than
        // surfacing a constraint name.
        if (error.code === '23505') {
          throw new Error(`You already have a ${kind} category called “${trimmed}”.`)
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}


/**
 * Every category, archived ones included — only the Settings manager wants
 * this; every picker stays on `useCategories`, which hides them.
 */
export function useAllCategories() {
  return useQuery({
    queryKey: [...categoryKeys.all, 'everything'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await getSupabase()
        .from('categories')
        .select('*')
        .order('kind')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Retires a category from every picker, or brings one back.
 *
 * Archive, never delete: transactions already filed under it keep their
 * history and their place in old months' totals — the seeds are a starting
 * point, and "I will never track Clothing" should not rewrite the past.
 * System categories are refused here because the pipeline looks them up by
 * slug; archiving bank-charges would break fee posting silently.
 */
export function useSetCategoryArchived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      categoryId,
      archived,
    }: {
      categoryId: string
      archived: boolean
    }) => {
      const { data: category, error: readError } = await getSupabase()
        .from('categories')
        .select('is_system')
        .eq('id', categoryId)
        .single()
      if (readError) throw readError
      if (category.is_system && archived)
        throw new Error('That one is used by the app itself and has to stay.')

      const { error } = await getSupabase()
        .from('categories')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}
