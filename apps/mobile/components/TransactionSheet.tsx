import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { format } from 'date-fns'
import {
  formatMoney,
  parseAmount,
  toNumber,
  useCategories,
  useDeleteTransaction,
  useSetOwed,
  useSplitTransaction,
  useUpdateTransaction,
  type TransactionRow,
} from '@batwa/core'

import { AddCategory } from './AddCategory'
import { useColors } from '../lib/useTheme'
import type { Colors } from '../lib/theme'

type Mode = 'view' | 'split' | 'owed' | 'delete'

function title(t: TransactionRow): string {
  if (t.type === 'transfer') {
    return `${t.account?.name ?? 'Account'} → ${t.counterparty_account?.name ?? 'Account'}`
  }
  return t.merchant?.display_name ?? t.category?.name ?? t.note ?? 'Transaction'
}

function chipStyle(colors: Colors, active: boolean) {
  return {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: active ? colors.brand : colors.line,
    backgroundColor: active ? colors.brand : 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 7,
  } as const
}

/** Breaking one payment into the several things it actually paid for. */
function SplitPanel({
  transaction,
  onDone,
}: {
  transaction: TransactionRow
  onDone: () => void
}) {
  const colors = useColors()
  const split = useSplitTransaction()
  const { data: categories = [] } = useCategories(
    transaction.type === 'income' ? 'income' : 'expense',
  )
  const total = toNumber(transaction.amount)
  const [rows, setRows] = useState([
    { amount: '', categoryId: transaction.category_id ?? '' },
    { amount: '', categoryId: '' },
  ])

  const amounts = useMemo(
    () => rows.map((r) => parseAmount(r.amount) ?? 0),
    [rows],
  )
  const assigned = amounts.reduce((a, b) => a + b, 0)
  const remaining = Math.round((total - assigned) * 100) / 100
  const balanced = remaining === 0 && amounts.every((a) => a > 0)

  function update(i: number, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  /** Fills this row with whatever is unassigned — the usual last step. */
  function takeRest(i: number) {
    const others = amounts.reduce((sum, a, j) => (j === i ? sum : sum + a), 0)
    update(i, { amount: String(Math.round((total - others) * 100) / 100) })
  }

  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={row.amount}
              onChangeText={(t) => update(i, { amount: t })}
              placeholder="0"
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                paddingHorizontal: 12,
                fontSize: 15,
                fontWeight: '600',
                color: colors.ink,
              }}
            />
            <Pressable onPress={() => takeRest(i)} hitSlop={8}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.sub }}>
                rest
              </Text>
            </Pressable>
            {rows.length > 2 ? (
              <Pressable
                onPress={() => setRows((p) => p.filter((_, j) => j !== i))}
                hitSlop={8}
              >
                <Text style={{ fontSize: 16, color: colors.sub }}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() =>
                  update(i, { categoryId: row.categoryId === c.id ? '' : c.id })
                }
                style={chipStyle(colors, row.categoryId === c.id)}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: row.categoryId === c.id ? colors.brandOn : colors.sub,
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => setRows((p) => [...p, { amount: '', categoryId: '' }])}
      >
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.brand }}>
          + Another part
        </Text>
      </Pressable>

      <Text
        style={{
          fontSize: 13,
          color: remaining === 0 ? colors.sub : colors.neg,
        }}
      >
        {remaining === 0
          ? 'Adds up.'
          : remaining > 0
            ? `${formatMoney(remaining)} still to assign`
            : `${formatMoney(Math.abs(remaining))} over`}
      </Text>

      {split.isError ? (
        <Text style={{ fontSize: 12.5, color: colors.neg }}>
          {split.error instanceof Error ? split.error.message : 'Could not split'}
        </Text>
      ) : null}

      <Pressable
        disabled={!balanced || split.isPending}
        onPress={async () => {
          await split.mutateAsync({
            transactionId: transaction.id,
            parts: rows.map((row, i) => ({
              amount: amounts[i]!,
              categoryId: row.categoryId || null,
            })),
          })
          onDone()
        }}
        style={{
          borderRadius: 12,
          backgroundColor: colors.brand,
          paddingVertical: 13,
          alignItems: 'center',
          opacity: !balanced || split.isPending ? 0.5 : 1,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.brandOn }}>
          {split.isPending ? 'Splitting…' : `Split into ${rows.length}`}
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * What you can do to a transaction once it exists.
 *
 * Recategorise, split, note that someone owes part of it, or delete. Not a
 * full edit form: the amount and date came from the bank and are rarely the
 * thing that is wrong — what people actually revisit is what a payment WAS.
 */
export function TransactionSheet({
  transaction,
  onClose,
}: {
  transaction: TransactionRow
  onClose: () => void
}) {
  const colors = useColors()
  const [mode, setMode] = useState<Mode>('view')
  const [owedBy, setOwedBy] = useState(transaction.owed_by ?? '')
  const [owedAmount, setOwedAmount] = useState(
    transaction.owed_amount != null ? String(toNumber(transaction.owed_amount)) : '',
  )

  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()
  const setOwed = useSetOwed()
  const { data: categories = [] } = useCategories(
    transaction.type === 'income' ? 'income' : 'expense',
  )

  const canSplit = transaction.type !== 'transfer'

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 18,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
                {title(transaction)}
              </Text>
              <Text style={{ fontSize: 12.5, color: colors.sub }}>
                {formatMoney(transaction.amount)} ·{' '}
                {format(new Date(transaction.occurred_at), 'd MMM yyyy')}
                {transaction.account?.name ? ` · ${transaction.account.name}` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 20, color: colors.sub }}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
            {mode === 'view' ? (
              <>
                {transaction.type !== 'transfer' ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.sub }}>
                      Category
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {categories.map((c) => {
                        const active = transaction.category_id === c.id
                        return (
                          <Pressable
                            key={c.id}
                            disabled={update.isPending}
                            onPress={async () => {
                              await update.mutateAsync({
                                id: transaction.id,
                                category_id: active ? null : c.id,
                                status: 'cleared',
                              })
                              onClose()
                            }}
                            style={chipStyle(colors, active)}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: active ? colors.brandOn : colors.sub,
                              }}
                            >
                              {c.name}
                            </Text>
                          </Pressable>
                        )
                      })}
                      <AddCategory
                        kind={transaction.type === 'income' ? 'income' : 'expense'}
                        onCreated={async (category) => {
                          await update.mutateAsync({
                            id: transaction.id,
                            category_id: category.id,
                            status: 'cleared',
                          })
                          onClose()
                        }}
                      />
                    </View>
                  </View>
                ) : null}

                {transaction.owed_amount != null ? (
                  <Text style={{ fontSize: 13, color: colors.goldInk, fontWeight: '600' }}>
                    {transaction.owed_by} owes {formatMoney(transaction.owed_amount)}
                  </Text>
                ) : null}

                <View style={{ gap: 8 }}>
                  {canSplit ? (
                    <Pressable
                      onPress={() => setMode('split')}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.line,
                        paddingVertical: 13,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                        Split this payment
                      </Text>
                    </Pressable>
                  ) : null}

                  {canSplit ? (
                    <Pressable
                      onPress={() => setMode('owed')}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.line,
                        paddingVertical: 13,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                        {transaction.owed_amount != null
                          ? 'Change who owes it'
                          : 'Someone owes part of this'}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable onPress={() => setMode('delete')} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.neg }}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {mode === 'split' ? (
              <SplitPanel transaction={transaction} onDone={onClose} />
            ) : null}

            {mode === 'owed' ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={owedBy}
                  onChangeText={setOwedBy}
                  placeholder="Who — e.g. Mohsin"
                  placeholderTextColor={colors.sub}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    fontSize: 14,
                    color: colors.ink,
                  }}
                />
                <TextInput
                  value={owedAmount}
                  onChangeText={setOwedAmount}
                  placeholder="How much of it"
                  placeholderTextColor={colors.sub}
                  keyboardType="decimal-pad"
                  style={{
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    fontSize: 14,
                    color: colors.ink,
                  }}
                />
                <Text style={{ fontSize: 12.5, color: colors.sub, lineHeight: 18 }}>
                  The spend stays on your books in full — this just remembers who
                  owes you what, until their payment arrives.
                </Text>
                {setOwed.isError ? (
                  <Text style={{ fontSize: 12.5, color: colors.neg }}>
                    {setOwed.error instanceof Error
                      ? setOwed.error.message
                      : 'Could not save'}
                  </Text>
                ) : null}
                <Pressable
                  disabled={setOwed.isPending || !owedBy.trim() || !parseAmount(owedAmount)}
                  onPress={async () => {
                    await setOwed.mutateAsync({
                      transactionId: transaction.id,
                      owedBy,
                      owedAmount: parseAmount(owedAmount),
                    })
                    onClose()
                  }}
                  style={{
                    borderRadius: 12,
                    backgroundColor: colors.brand,
                    paddingVertical: 13,
                    alignItems: 'center',
                    opacity:
                      setOwed.isPending || !owedBy.trim() || !parseAmount(owedAmount)
                        ? 0.5
                        : 1,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.brandOn }}>
                    {setOwed.isPending ? 'Saving…' : 'Remember it'}
                  </Text>
                </Pressable>
                {transaction.owed_amount != null ? (
                  <Pressable
                    onPress={async () => {
                      await setOwed.mutateAsync({
                        transactionId: transaction.id,
                        owedBy: null,
                        owedAmount: null,
                      })
                      onClose()
                    }}
                    style={{ alignItems: 'center', paddingVertical: 10 }}
                  >
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.sub }}>
                      Clear the claim
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {mode === 'delete' ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.neg }}>
                  Delete this transaction? Balances will be recalculated.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    disabled={remove.isPending}
                    onPress={async () => {
                      await remove.mutateAsync(transaction.id)
                      onClose()
                    }}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: colors.neg,
                      paddingVertical: 13,
                      alignItems: 'center',
                      opacity: remove.isPending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                      {remove.isPending ? 'Deleting…' : 'Delete'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMode('view')}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.line,
                      paddingVertical: 13,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                      Keep
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
