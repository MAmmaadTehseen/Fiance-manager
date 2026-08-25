import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  formatMoney,
  parseAmount,
  toNumber,
  useAccounts,
  useCreateReceivable,
  useOwedToYou,
  useSettleOwed,
  useTransactions,
  type TransactionRow,
} from '@batwa/core'

import { Card, EmptyState, SectionTitle } from './ui'
import { useColors } from '../lib/useTheme'

function claimLabel(t: TransactionRow): string {
  return t.merchant?.display_name ?? t.note ?? t.category?.name ?? 'a payment'
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Picks the incoming payment that settled a claim.
 *
 * Recent income, closest to the owed amount first — that is nearly always the
 * repayment. Linking rather than ticking done keeps the books able to explain
 * themselves later: which rupees closed this.
 */
function SettlePicker({
  claim,
  onClose,
}: {
  claim: TransactionRow
  onClose: () => void
}) {
  const colors = useColors()
  const settle = useSettleOwed()
  const { data: incomes = [] } = useTransactions({ type: 'income', limit: 12 })

  const owed = toNumber(claim.owed_amount)
  const candidates = [...incomes].sort(
    (a, b) =>
      Math.abs(toNumber(a.amount) - owed) - Math.abs(toNumber(b.amount) - owed),
  )

  return (
    <View style={{ gap: 8, backgroundColor: colors.soft, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
        Which payment was {claim.owed_by} paying you back?
      </Text>

      {candidates.length === 0 ? (
        <Text style={{ fontSize: 13, color: colors.sub }}>
          No incoming payments yet — settle it here when one arrives.
        </Text>
      ) : (
        candidates.slice(0, 6).map((income) => (
          <Pressable
            key={income.id}
            disabled={settle.isPending}
            onPress={async () => {
              await settle.mutateAsync({
                transactionId: claim.id,
                settledById: income.id,
              })
              onClose()
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingVertical: 7,
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: colors.card,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink }}
            >
              {claimLabel(income)}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.pos }}>
              +{formatMoney(income.amount)}
            </Text>
          </Pressable>
        ))
      )}

      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.sub }}>
          Not yet
        </Text>
      </Pressable>
    </View>
  )
}

/** Noting money you are expecting — side work, a loan, anything promised. */
function ExpectingForm({ onDone }: { onDone: () => void }) {
  const colors = useColors()
  const create = useCreateReceivable()
  const { data: accounts = [] } = useAccounts()
  const [from, setFrom] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')

  const accountId =
    accounts.find((a) => a.is_primary)?.id ?? accounts[0]?.id ?? null

  const field = {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: colors.ink,
  } as const

  const ready = from.trim() && parseAmount(amount) && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)

  async function save() {
    const parsed = parseAmount(amount)
    if (!parsed || !accountId) return
    await create.mutateAsync({
      from,
      amount: parsed,
      dueDate,
      accountId,
      note: note || null,
    })
    onDone()
  }

  return (
    <View style={{ gap: 8, backgroundColor: colors.soft, borderRadius: 12, padding: 12 }}>
      <TextInput
        value={from}
        onChangeText={setFrom}
        placeholder="From — e.g. Uzair"
        placeholderTextColor={colors.sub}
        style={field}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="How much — 20k works"
        placeholderTextColor={colors.sub}
        keyboardType="decimal-pad"
        style={field}
      />
      {/* Typed rather than a picker: a date wheel is three taps and a scroll
          for something most people already know as a number. */}
      <TextInput
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="Due — YYYY-MM-DD"
        placeholderTextColor={colors.sub}
        autoCapitalize="none"
        style={field}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="For — e.g. 35h website work"
        placeholderTextColor={colors.sub}
        style={field}
      />

      {create.isError ? (
        <Text style={{ fontSize: 12.5, color: colors.neg }}>
          {create.error instanceof Error ? create.error.message : 'Could not save'}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          disabled={!ready || create.isPending}
          onPress={() => void save()}
          style={{
            borderRadius: 10,
            backgroundColor: colors.brand,
            paddingHorizontal: 16,
            paddingVertical: 10,
            opacity: !ready || create.isPending ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brandOn }}>
            {create.isPending ? 'Saving…' : 'Expect it'}
          </Text>
        </Pressable>
        <Pressable onPress={onDone} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.sub }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * The khata — who owes you, and what you are still expecting.
 *
 * Money lent inside a payment and money promised for work are the same
 * question to the person owed, so they share one list. The total is what is
 * outstanding across both.
 */
export function OwedView() {
  const colors = useColors()
  const { data: claims = [], isLoading } = useOwedToYou()
  const [settling, setSettling] = useState<string | null>(null)
  const [expecting, setExpecting] = useState(false)

  const total = claims.reduce((sum, c) => sum + toNumber(c.owed_amount), 0)

  return (
    <View style={{ gap: 14 }}>
      <SectionTitle
        right={
          expecting ? undefined : (
            <Pressable onPress={() => setExpecting(true)} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gold }}>
                + Expecting
              </Text>
            </Pressable>
          )
        }
      >
        Owed to you
      </SectionTitle>

      {expecting ? (
        <Card>
          <ExpectingForm onDone={() => setExpecting(false)} />
        </Card>
      ) : null}

      {!isLoading && claims.length === 0 ? (
        <Card>
          <EmptyState
            title="Nobody owes you"
            description="Split a payment and mark a share as owed, or note money you are expecting for work."
          />
        </Card>
      ) : (
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: colors.sub }}>Outstanding</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.goldInk }}>
              {formatMoney(total)}
            </Text>
          </View>

          {claims.map((claim) => {
            const isExpectation = claim.status === 'pending'
            const overdue = isExpectation && new Date(claim.occurred_at) < new Date()
            return (
              <View key={claim.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}
                    >
                      {claim.owed_by}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        color: overdue ? colors.neg : colors.sub,
                        fontWeight: overdue ? '700' : '400',
                      }}
                    >
                      {isExpectation
                        ? `${claim.note ? `${claim.note} · ` : ''}${overdue ? 'overdue — was due' : 'due'} ${shortDate(claim.occurred_at)}`
                        : `for ${claimLabel(claim)} · ${shortDate(claim.occurred_at)}`}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                    {formatMoney(claim.owed_amount)}
                  </Text>
                  <Pressable
                    onPress={() => setSettling(settling === claim.id ? null : claim.id)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.line,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.sub }}>
                      Paid back
                    </Text>
                  </Pressable>
                </View>

                {settling === claim.id ? (
                  <SettlePicker claim={claim} onClose={() => setSettling(null)} />
                ) : null}
              </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}
