/**
 * Activity — the full ledger, filterable, with a manual add for cash and
 * anything the SMS pipeline can't see. Mirrors the web Activity page.
 */
import { useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { format } from 'date-fns'
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useInboxCount,
  useTransactions,
  parseAmount,
  type NewTransaction,
  type TransactionRow,
  type TransactionType,
} from '@batwa/core'
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  Money,
  Screen,
  ScreenHeader,
} from '../../components/ui'
import { useColors } from '../../lib/useTheme'

type Filter = 'all' | TransactionType | 'uncategorised'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
]

function initial(t: TransactionRow): string {
  const source = t.merchant?.display_name ?? t.category?.name ?? t.note ?? '?'
  return source.trim()[0]?.toUpperCase() ?? '?'
}

function Row({ t }: { t: TransactionRow }) {
  const colors = useColors()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingVertical: 11,
      }}
    >
      <Avatar tone={t.type === 'transfer' ? 'neutral' : 'gold'}>
        {t.type === 'transfer' ? '⇄' : initial(t)}
      </Avatar>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>
          {t.type === 'transfer'
            ? `${t.account?.name ?? ''} → ${t.counterparty_account?.name ?? ''}`
            : t.merchant?.display_name ?? t.category?.name ?? t.note ?? 'Transaction'}
        </Text>
        <Text style={{ color: colors.sub, fontSize: 12.5 }} numberOfLines={1}>
          {format(new Date(t.occurred_at), 'd MMM')}
          {t.account?.name ? ` · ${t.account.name}` : ''}
          {t.status === 'needs_review' ? ' · needs review' : ''}
        </Text>
      </View>
      <Money
        value={t.amount}
        currency={t.currency}
        sign={t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
        style={{
          fontSize: 14.5,
          color:
            t.type === 'income'
              ? colors.pos
              : t.type === 'transfer'
                ? colors.sub
                : colors.ink,
        }}
      />
    </View>
  )
}

// ------------------------------------------------------- add-transaction

function AddTransaction({ onClose }: { onClose: () => void }) {
  const colors = useColors()
  const create = useCreateTransaction()
  const { data: accounts = [] } = useAccounts()

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [] } = useCategories(
    type === 'income' ? 'income' : 'expense',
  )

  async function save() {
    setError(null)
    const value = parseAmount(amount)
    if (!value) return setError('Enter an amount.')
    if (!accountId) return setError('Pick an account.')
    if (type === 'transfer' && !counterpartyId)
      return setError('Pick where the money goes.')
    if (type === 'transfer' && counterpartyId === accountId)
      return setError('A transfer needs two different accounts.')

    const input: NewTransaction = {
      account_id: accountId,
      type,
      amount: value,
      occurred_at: new Date().toISOString(),
      status: 'cleared',
      note: note.trim() || null,
      category_id: type === 'transfer' ? null : categoryId,
      counterparty_account_id: type === 'transfer' ? counterpartyId : null,
    }

    try {
      await create.mutateAsync(input)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const label = { fontSize: 13, fontWeight: '700' as const, color: colors.ink }
  const inputStyle = {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 18,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>
            Add transaction
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.sub, fontSize: 22 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }}>
          {error && (
            <View style={{ backgroundColor: colors.goldSoft, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: colors.neg, fontSize: 13.5 }}>{error}</Text>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={label}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
                <Chip
                  key={t}
                  label={t[0].toUpperCase() + t.slice(1)}
                  active={type === t}
                  onPress={() => {
                    setType(t)
                    setCategoryId(null)
                  }}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>{type === 'transfer' ? 'From' : 'Account'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {accounts.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  active={accountId === a.id}
                  onPress={() => setAccountId(a.id)}
                />
              ))}
            </View>
          </View>

          {type === 'transfer' ? (
            <View style={{ gap: 8 }}>
              <Text style={label}>To</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <Chip
                      key={a.id}
                      label={a.name}
                      active={counterpartyId === a.id}
                      onPress={() => setCounterpartyId(a.id)}
                    />
                  ))}
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={label}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={categoryId === c.id}
                    onPress={() => setCategoryId(c.id)}
                    tone="gold"
                  />
                ))}
              </View>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={label}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              placeholderTextColor={colors.sub}
              style={inputStyle}
            />
          </View>

          <Button label="Save" onPress={save} busy={create.isPending} />
        </ScrollView>
      </View>
    </Modal>
  )
}

// -------------------------------------------------------------- screen

export default function ActivityScreen() {
  const colors = useColors()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const { data: needsReview = 0 } = useInboxCount()

  const params = useMemo(
    () => ({
      limit: 200,
      ...(filter === 'uncategorised'
        ? { status: 'needs_review' as const }
        : filter === 'all'
          ? {}
          : { type: filter }),
    }),
    [filter],
  )

  const {
    data: transactions = [],
    isLoading,
    refetch,
    isRefetching,
  } = useTransactions(params)

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <ScreenHeader
        title="Activity"
        subtitle="Every rupee, in and out."
        right={
          <Pressable
            onPress={() => setAdding(true)}
            style={{
              height: 42,
              borderRadius: 12,
              backgroundColor: colors.brand,
              paddingHorizontal: 16,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.brandOn, fontSize: 14, fontWeight: '700' }}>
              + Add
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            active={filter === f.id}
            onPress={() => setFilter(f.id)}
          />
        ))}
        {needsReview > 0 && (
          <Chip
            label={`Uncategorised · ${needsReview}`}
            active={filter === 'uncategorised'}
            onPress={() => setFilter('uncategorised')}
            tone="gold"
          />
        )}
      </ScrollView>

      {!isLoading && transactions.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'all' ? 'No transactions yet' : 'Nothing in this filter'}
            description={
              filter === 'all'
                ? 'Record one by hand to get started. Once your phone is connected, most of these appear on their own.'
                : 'Try another filter, or clear it to see everything.'
            }
          />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {transactions.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </Card>
      )}

      {adding && <AddTransaction onClose={() => setAdding(false)} />}
    </Screen>
  )
}
