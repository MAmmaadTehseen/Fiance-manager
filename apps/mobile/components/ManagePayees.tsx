import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  useMergeMerchants,
  useMerchants,
  type MerchantSummary,
} from '@batwa/core'

import { Card, SectionTitle } from './ui'
import { useColors } from '../lib/useTheme'

/**
 * Folding several names into one payee.
 *
 * A shopkeeper collecting through family members' accounts appears as five
 * different people, so each name learns its category separately and the daily
 * purchase lands in the Inbox once per name. Tick the ones that are really the
 * same shop, choose which name survives, merge.
 */
export function ManagePayees() {
  const colors = useColors()
  const { data: merchants = [], isLoading } = useMerchants()
  const merge = useMergeMerchants()
  const [selected, setSelected] = useState<string[]>([])
  const [keep, setKeep] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (isLoading || merchants.length < 2) return null

  const chosen = merchants.filter((m) => selected.includes(m.id))
  const survivor = chosen.find((m) => m.id === keep) ?? chosen[0]

  function toggle(m: MerchantSummary) {
    setFlash(null)
    setSelected((prev) =>
      prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
    )
  }

  async function doMerge() {
    if (!survivor || chosen.length < 2) return
    await merge.mutateAsync({
      intoId: survivor.id,
      aliasIds: chosen.map((m) => m.id),
    })
    setFlash(
      `Merged into ${survivor.display_name}. Teaching any of them now teaches the shop.`,
    )
    setSelected([])
    setKeep(null)
  }

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Payees</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, color: colors.sub, lineHeight: 19 }}>
          One shop collecting through several accounts shows up as several
          people. Tap the names that are really the same, and merge them.
        </Text>

        {flash ? (
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.pos }}>
            {flash}
          </Text>
        ) : null}

        <View style={{ gap: 2 }}>
          {merchants.map((m) => {
            const on = selected.includes(m.id)
            return (
              <Pressable
                key={m.id}
                onPress={() => toggle(m)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: on ? colors.soft : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: on ? colors.brand : colors.line,
                    backgroundColor: on ? colors.brand : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? (
                    <Text style={{ fontSize: 11, fontWeight: '900', color: colors.brandOn }}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink }}
                >
                  {m.display_name}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.sub }}>
                  {m.category?.name ?? 'untaught'} · {m.times_seen}×
                </Text>
              </Pressable>
            )
          })}
        </View>

        {chosen.length >= 2 ? (
          <View style={{ gap: 10, backgroundColor: colors.soft, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
              Keep which name?
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chosen.map((m) => {
                const active = survivor?.id === m.id
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setKeep(m.id)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.brand : colors.line,
                      backgroundColor: active ? colors.brand : 'transparent',
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: active ? colors.brandOn : colors.sub,
                      }}
                    >
                      {m.display_name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {merge.isError ? (
              <Text style={{ fontSize: 12.5, color: colors.neg }}>
                {merge.error instanceof Error ? merge.error.message : 'Could not merge'}
              </Text>
            ) : null}

            <Pressable
              disabled={merge.isPending}
              onPress={() => void doMerge()}
              style={{
                alignSelf: 'flex-start',
                borderRadius: 10,
                backgroundColor: colors.brand,
                paddingHorizontal: 16,
                paddingVertical: 10,
                opacity: merge.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brandOn }}>
                {merge.isPending
                  ? 'Merging…'
                  : `Merge ${chosen.length} into ${survivor?.display_name}`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    </View>
  )
}
