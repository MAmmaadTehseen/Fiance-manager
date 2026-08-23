/**
 * Plan — budgets, savings goals and detected recurring charges, in one tab so
 * the bottom bar stays legible. Mirrors the web Budgets and Goals pages on the
 * shared data layer. (CSV export stays web-only; it needs a file/share the way
 * a browser download gives for free.)
 */
import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { startOfMonth } from 'date-fns'
import {
  useBudgets,
  useCategories,
  useCreateSavingsGoal,
  useDeleteBudget,
  useDeleteSavingsGoal,
  useRecurring,
  useSavingsGoals,
  useTransactions,
  useUpdateSavingsGoal,
  useUpsertBudget,
  formatMoney,
  parseAmount,
  toNumber,
  type SavingsGoal,
} from '@batwa/core'
import {
  Card,
  EmptyState,
  Money,
  Screen,
  ScreenHeader,
} from '../../components/ui'
import { useColors } from '../../lib/useTheme'
import type { Colors } from '../../lib/theme'

type Segment = 'budgets' | 'goals' | 'recurring'

function useInputStyle(colors: Colors) {
  return {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
  }
}

function ProgressBar({ ratio, over }: { ratio: number; over: boolean }) {
  const colors = useColors()
  const fill = over ? colors.neg : ratio >= 0.8 ? colors.gold : colors.brand
  return (
    <View style={{ height: 10, borderRadius: 999, backgroundColor: colors.soft, overflow: 'hidden' }}>
      <View style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, ratio * 100)}%`, backgroundColor: fill }} />
    </View>
  )
}

// ------------------------------------------------------------- budgets

function BudgetsView() {
  const colors = useColors()
  const input = useInputStyle(colors)
  const { data: budgets = [] } = useBudgets()
  const { data: categories = [] } = useCategories('expense')
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()

  const monthStart = useMemo(() => startOfMonth(new Date()).toISOString(), [])
  const { data: monthTx = [] } = useTransactions({ from: monthStart, type: 'expense', limit: 2000 })

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of monthTx) {
      if (!t.category?.id) continue
      m.set(t.category.id, (m.get(t.category.id) ?? 0) + toNumber(t.amount))
    }
    return m
  }, [monthTx])

  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const available = categories.filter((c) => !budgetedIds.has(c.id))

  const [pickedCategory, setPickedCategory] = useState<string | null>(null)
  const [amount, setAmount] = useState('')

  async function add() {
    const value = parseAmount(amount)
    if (!pickedCategory || !value) return
    await upsert.mutateAsync({ categoryId: pickedCategory, amount: value })
    setPickedCategory(null)
    setAmount('')
  }

  return (
    <View style={{ gap: 16 }}>
      {available.length > 0 && (
        <Card>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Set a budget</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {available.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setPickedCategory(c.id)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: pickedCategory === c.id ? colors.brand : colors.card,
                  borderWidth: pickedCategory === c.id ? 0 : 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: pickedCategory === c.id ? colors.brandOn : colors.sub }}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Monthly limit"
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              style={[input, { flex: 1 }]}
            />
            <Pressable
              onPress={add}
              disabled={upsert.isPending || !pickedCategory}
              style={{
                height: 46,
                borderRadius: 12,
                backgroundColor: colors.brand,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: upsert.isPending || !pickedCategory ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.brandOn, fontWeight: '700' }}>Add</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {budgets.length === 0 ? (
        <Card>
          <EmptyState title="No budgets yet" description="Pick a category above and set a monthly limit to track it here." />
        </Card>
      ) : (
        <Card style={{ gap: 18 }}>
          {budgets.map((b) => {
            const spent = spentByCategory.get(b.category_id) ?? 0
            const amount = toNumber(b.amount)
            const ratio = amount > 0 ? spent / amount : 0
            const over = spent > amount
            const remaining = amount - spent
            return (
              <View key={b.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>
                    {b.category?.name ?? 'Category'}
                  </Text>
                  <Text style={{ color: over ? colors.neg : colors.sub, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                    {formatMoney(spent)} / {formatMoney(amount)}
                  </Text>
                </View>
                <ProgressBar ratio={ratio} over={over} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.sub, fontSize: 12 }}>
                    {remaining >= 0 ? `${formatMoney(remaining)} left` : `${formatMoney(-remaining)} over`}
                  </Text>
                  <Pressable onPress={() => remove.mutate(b.id)}>
                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}

// --------------------------------------------------------------- goals

function GoalCard({ goal }: { goal: SavingsGoal }) {
  const colors = useColors()
  const input = useInputStyle(colors)
  const update = useUpdateSavingsGoal()
  const remove = useDeleteSavingsGoal()
  const [contribution, setContribution] = useState('')

  const saved = toNumber(goal.saved_amount)
  const target = toNumber(goal.target_amount)
  const ratio = target > 0 ? saved / target : 0
  const done = ratio >= 1
  const remaining = Math.max(0, target - saved)

  async function addMoney() {
    const delta = parseAmount(contribution)
    if (!delta) return
    await update.mutateAsync({ id: goal.id, saved_amount: saved + delta })
    setContribution('')
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {goal.name}
        </Text>
        <Pressable onPress={() => remove.mutate(goal.id)} hitSlop={8}>
          <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '600' }}>Delete</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Money value={saved} style={{ color: colors.ink, fontSize: 22, fontWeight: '800' }} />
        <Text style={{ color: colors.sub, fontSize: 13 }}>of {formatMoney(target)}</Text>
      </View>
      <ProgressBar ratio={ratio} over={false} />
      <Text style={{ color: colors.sub, fontSize: 12 }}>
        {done ? '🎉 Goal reached' : `${formatMoney(remaining)} to go · ${Math.round(ratio * 100)}%`}
      </Text>

      {!done && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={contribution}
            onChangeText={setContribution}
            placeholder="Add money…"
            placeholderTextColor={colors.sub}
            keyboardType="decimal-pad"
            style={[input, { flex: 1, height: 42 }]}
          />
          <Pressable
            onPress={addMoney}
            disabled={update.isPending}
            style={{ height: 42, borderRadius: 12, backgroundColor: colors.brand, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', opacity: update.isPending ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.brandOn, fontWeight: '700' }}>Add</Text>
          </Pressable>
        </View>
      )}
    </Card>
  )
}

function GoalsView() {
  const colors = useColors()
  const input = useInputStyle(colors)
  const { data: goals = [] } = useSavingsGoals()
  const create = useCreateSavingsGoal()

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  async function add() {
    const amount = parseAmount(target)
    if (!name.trim() || !amount) return
    await create.mutateAsync({ name, target_amount: amount })
    setName('')
    setTarget('')
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>New goal</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Umrah fund"
          placeholderTextColor={colors.sub}
          style={input}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={target}
            onChangeText={setTarget}
            placeholder="Target amount"
            placeholderTextColor={colors.sub}
            keyboardType="decimal-pad"
            style={[input, { flex: 1 }]}
          />
          <Pressable
            onPress={add}
            disabled={create.isPending}
            style={{ height: 46, borderRadius: 12, backgroundColor: colors.brand, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', opacity: create.isPending ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.brandOn, fontWeight: '700' }}>Create</Text>
          </Pressable>
        </View>
      </Card>

      {goals.length === 0 ? (
        <Card>
          <EmptyState title="No goals yet" description="Create a target above, then top it up as you save toward it." />
        </Card>
      ) : (
        goals.map((g) => <GoalCard key={g.id} goal={g} />)
      )}
    </View>
  )
}

// ----------------------------------------------------------- recurring

function RecurringView() {
  const colors = useColors()
  const recurring = useRecurring()

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Recurring charges</Text>
        {recurring.items.length > 0 && (
          <Text style={{ color: colors.sub, fontSize: 13 }}>~{formatMoney(recurring.monthlyTotal)}/mo</Text>
        )}
      </View>
      {recurring.items.length === 0 ? (
        <Text style={{ color: colors.sub, fontSize: 13.5, lineHeight: 20 }}>
          Nothing detected yet. When a charge from the same place shows up across a
          couple of months, it appears here as a likely subscription or bill.
        </Text>
      ) : (
        recurring.items.map((r) => (
          <View
            key={r.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{r.name}</Text>
              <Text style={{ color: colors.sub, fontSize: 12 }}>
                {r.categoryName ? `${r.categoryName} · ` : ''}{r.occurrences} charges over {r.months} months
              </Text>
            </View>
            <Money value={r.amount} currency={r.currency} style={{ color: colors.ink, fontSize: 14 }} />
          </View>
        ))
      )}
    </Card>
  )
}

// -------------------------------------------------------------- screen

export default function PlanScreen() {
  const colors = useColors()
  const [segment, setSegment] = useState<Segment>('budgets')

  const segments: { id: Segment; label: string }[] = [
    { id: 'budgets', label: 'Budgets' },
    { id: 'goals', label: 'Goals' },
    { id: 'recurring', label: 'Recurring' },
  ]

  return (
    <Screen>
      <ScreenHeader title="Plan" />

      <View style={{ flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 12, padding: 3 }}>
        {segments.map((s) => {
          const active = segment === s.id
          return (
            <Pressable
              key={s.id}
              onPress={() => setSegment(s.id)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: active ? colors.card : 'transparent' }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: active ? colors.ink : colors.sub }}>{s.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {segment === 'budgets' && <BudgetsView />}
      {segment === 'goals' && <GoalsView />}
      {segment === 'recurring' && <RecurringView />}
    </Screen>
  )
}
