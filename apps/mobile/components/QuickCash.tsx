import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  formatMoney,
  parseAmount,
  useAccountBalances,
  useCategories,
  useCreateTransaction,
  useTransactions,
} from '@batwa/core'

import { useColors } from '../lib/useTheme'

/** Recent cash spends are the best guide to what the next one will be. */
const RECENT_WINDOW = 60

/**
 * Logging a cash spend in two taps — the mobile twin of the web bar.
 *
 * This one matters more on the phone than anywhere else: the moment a cash
 * spend is worth recording is standing at the counter, and anything longer
 * than amount-then-category does not get done. Everything else is inferred —
 * the Cash account, now, cleared.
 *
 * Hidden when there is no cash account, since it could not describe anything.
 */
export function QuickCash() {
  const colors = useColors()
  const { data: accounts = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories('expense')
  const { data: recent = [] } = useTransactions({
    type: 'expense',
    limit: RECENT_WINDOW,
  })
  const create = useCreateTransaction()

  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const cash = accounts.find((a) => a.type === 'cash')

  // What this person actually puts cash to, most recently used first; seeded
  // categories fill any gap so a new user still has something to tap.
  const suggested = useMemo(() => {
    const seen: string[] = []
    for (const t of recent) {
      if (t.account?.type !== 'cash') continue
      if (t.category_id && !seen.includes(t.category_id)) seen.push(t.category_id)
      if (seen.length >= 5) break
    }
    const byId = new Map(categories.map((c) => [c.id, c]))
    const ordered = seen.map((id) => byId.get(id)).filter((c) => c != null)
    for (const c of categories) {
      if (ordered.length >= 5) break
      if (!ordered.some((o) => o.id === c.id)) ordered.push(c)
    }
    return ordered
  }, [recent, categories])

  const parsed = parseAmount(amount)
  if (!cash) return null

  async function log(categoryId: string, categoryName: string) {
    if (!parsed || !cash) return
    setBusy(categoryId)
    setFlash(null)
    try {
      await create.mutateAsync({
        account_id: cash.account_id,
        type: 'expense',
        amount: parsed,
        occurred_at: new Date().toISOString(),
        category_id: categoryId,
      })
      setFlash(`${formatMoney(parsed)} on ${categoryName.toLowerCase()}`)
      setAmount('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <View
      style={{
        gap: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          value={amount}
          onChangeText={(t) => {
            setAmount(t)
            setFlash(null)
          }}
          placeholder="Spent cash? Amount…"
          placeholderTextColor={colors.sub}
          keyboardType="decimal-pad"
          style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink }}
        />
        <Text style={{ fontSize: 12, color: colors.sub }}>
          {formatMoney(cash.balance)} on hand
        </Text>
      </View>

      {parsed != null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggested.map((c) => {
            const saving = busy === c.id
            return (
              <Pressable
                key={c.id}
                disabled={busy != null}
                onPress={() => void log(c.id, c.name)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: saving ? colors.brand : colors.line,
                  backgroundColor: saving ? colors.brand : 'transparent',
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  opacity: busy != null && !saving ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: saving ? colors.brandOn : colors.sub,
                  }}
                >
                  {saving ? 'Saving…' : c.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {flash ? (
        <Text style={{ fontSize: 12.5, color: colors.pos }}>Logged {flash}.</Text>
      ) : null}
    </View>
  )
}
