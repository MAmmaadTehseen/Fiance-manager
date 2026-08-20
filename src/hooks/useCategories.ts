import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category, CategoryKind } from '@/types/db'

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
      let q = supabase
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
