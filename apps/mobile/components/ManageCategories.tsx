import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  useAllCategories,
  useSetCategoryArchived,
  type Category,
} from '@batwa/core'

import { AddCategory } from './AddCategory'
import { Card, SectionTitle } from './ui'
import { useColors } from '../lib/useTheme'

/**
 * Retiring the seeds you will never use — the other half of "prefilled but
 * customisable". Archived, never deleted: old months keep their totals and a
 * change of heart is one tap. System categories are refused because the
 * pipeline looks them up by slug.
 */
function KindGroup({
  label,
  categories,
  onError,
}: {
  label: string
  categories: Category[]
  onError: (message: string) => void
}) {
  const colors = useColors()
  const setArchived = useSetCategoryArchived()
  if (categories.length === 0) return null

  const active = categories.filter((c) => !c.archived_at)
  const retired = categories.filter((c) => c.archived_at)

  async function flip(category: Category) {
    try {
      await setArchived.mutateAsync({
        categoryId: category.id,
        archived: !category.archived_at,
      })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not change that')
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: '700',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.sub,
        }}
      >
        {label}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {active.map((c) => (
          <Pressable
            key={c.id}
            disabled={setArchived.isPending || c.is_system}
            onPress={() => void flip(c)}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.line,
              paddingHorizontal: 14,
              paddingVertical: 7,
              opacity: c.is_system ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {retired.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: colors.sub }}>Retired:</Text>
          {retired.map((c) => (
            <Pressable
              key={c.id}
              disabled={setArchived.isPending}
              onPress={() => void flip(c)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.line,
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: colors.sub,
                  textDecorationLine: 'line-through',
                }}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function ManageCategories() {
  const colors = useColors()
  const { data: categories = [], isLoading } = useAllCategories()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return null

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Categories</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Text style={{ fontSize: 13, color: colors.sub, lineHeight: 19 }}>
          Tap one to retire it from every picker — nothing already filed under
          it changes, and a retired one comes back with a tap.
        </Text>

        <KindGroup
          label="Spending"
          categories={categories.filter((c) => c.kind === 'expense')}
          onError={setError}
        />
        <KindGroup
          label="Income"
          categories={categories.filter((c) => c.kind === 'income')}
          onError={setError}
        />

        {error ? (
          <Text style={{ fontSize: 12.5, color: colors.neg }}>{error}</Text>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <AddCategory kind="expense" onCreated={() => {}} />
        </View>
      </Card>
    </View>
  )
}
