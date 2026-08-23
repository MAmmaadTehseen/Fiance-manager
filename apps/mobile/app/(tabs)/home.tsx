/**
 * Home — the same story the web dashboard tells, sized for a phone: what you
 * have, what moved this month, where it went, and what still needs you.
 */
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { format, startOfMonth, subMonths } from 'date-fns'
import {
  useAccountBalances,
  useInboxCount,
  useTransactions,
  formatMoney,
  toNumber,
  type TransactionRow,
} from '@batwa/core'
import {
  Avatar,
  Card,
  Money,
  Screen,
  SectionTitle,
} from '../../components/ui'
import { useColors } from '../../lib/useTheme'
import { useSession } from '../../lib/session'

const MONTHS_SHOWN = 6

function greeting(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0]
  return first ? `Salaam, ${first}` : 'Salaam'
}

function initial(t: TransactionRow): string {
  const source = t.merchant?.display_name ?? t.category?.name ?? t.note ?? '?'
  return source.trim()[0]?.toUpperCase() ?? '?'
}

export default function HomeScreen() {
  const colors = useColors()
  const { session } = useSession()
  const displayName = session?.user?.user_metadata?.display_name as
    | string
    | undefined

  const { data: accounts = [], refetch: refetchAccounts, isRefetching } =
    useAccountBalances()
  const { data: inboxCount = 0 } = useInboxCount()

  const since = useMemo(
    () => startOfMonth(subMonths(new Date(), MONTHS_SHOWN - 1)).toISOString(),
    [],
  )
  const { data: window = [], refetch: refetchWindow } = useTransactions({
    from: since,
    limit: 2000,
  })
  const { data: recent = [], refetch: refetchRecent } = useTransactions({
    limit: 5,
  })

  const netWorth = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0)

  const { months, thisMonth, lastMonth, byCategory, spent } = useMemo(() => {
    const buckets = new Map<string, { label: string; in: number; out: number }>()
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      buckets.set(format(d, 'yyyy-MM'), { label: format(d, 'MMM'), in: 0, out: 0 })
    }

    const currentKey = format(new Date(), 'yyyy-MM')
    const categories = new Map<string, number>()

    for (const t of window) {
      // Transfers move money between the user's own accounts — not spending.
      if (t.type === 'transfer') continue
      const key = t.occurred_at.slice(0, 7)
      const bucket = buckets.get(key)
      const amount = toNumber(t.amount)
      if (bucket) {
        if (t.type === 'income') bucket.in += amount
        else bucket.out += amount
      }
      if (key === currentKey && t.type === 'expense') {
        const name = t.category?.name ?? 'Uncategorised'
        categories.set(name, (categories.get(name) ?? 0) + amount)
      }
    }

    const months = [...buckets.values()]
    const spent = [...categories.values()].reduce((a, b) => a + b, 0)
    const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    const tail = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0)
    const byCategory =
      tail > 0 ? [...top, ['Everything else', tail] as const] : top

    return {
      months,
      thisMonth: months[months.length - 1] ?? { in: 0, out: 0, label: '' },
      lastMonth: months[months.length - 2] ?? null,
      byCategory,
      spent,
    }
  }, [window])

  const peak = Math.max(1, ...months.flatMap((m) => [m.in, m.out]))
  const spentDelta =
    lastMonth && lastMonth.out > 0
      ? ((thisMonth.out - lastMonth.out) / lastMonth.out) * 100
      : null

  function refresh() {
    void refetchAccounts()
    void refetchWindow()
    void refetchRecent()
  }

  return (
    <Screen refreshing={isRefetching} onRefresh={refresh}>
      {/* -------------------------------------------------------- greeting */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.ink,
              fontSize: 26,
              fontWeight: '800',
              letterSpacing: -0.4,
            }}
          >
            {greeting(displayName)}
          </Text>
          <Text style={{ color: colors.sub, fontSize: 14, marginTop: 3 }}>
            Here&rsquo;s your money in {format(new Date(), 'MMMM')}.
          </Text>
        </View>
        <View
          style={{
            backgroundColor: colors.goldSoft,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: colors.goldInk, fontSize: 12.5, fontWeight: '700' }}>
            {format(new Date(), 'MMM yyyy')}
          </Text>
        </View>
      </View>

      {/* ---------------------------------------------------- balance hero */}
      <View
        style={{
          backgroundColor: colors.brand,
          borderRadius: 24,
          padding: 22,
          gap: 18,
        }}
      >
        <View>
          <Text style={{ color: colors.brandOn, opacity: 0.75, fontSize: 13.5, fontWeight: '600' }}>
            Total balance
          </Text>
          <Money
            value={netWorth}
            style={{ color: colors.brandOn, fontSize: 40, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22 }}>
          <View>
            <Text style={{ color: colors.brandOn, opacity: 0.75, fontSize: 12.5, fontWeight: '600' }}>
              In this month
            </Text>
            <Money value={thisMonth.in} sign="+" style={{ color: colors.pos, fontSize: 17, marginTop: 3 }} />
          </View>
          <View>
            <Text style={{ color: colors.brandOn, opacity: 0.75, fontSize: 12.5, fontWeight: '600' }}>
              Out this month
            </Text>
            <Money value={thisMonth.out} sign="−" style={{ color: colors.gold, fontSize: 17, marginTop: 3 }} />
          </View>
          {spentDelta !== null && (
            <View>
              <Text style={{ color: colors.brandOn, opacity: 0.75, fontSize: 12.5, fontWeight: '600' }}>
                vs {lastMonth?.label}
              </Text>
              <Text
                style={{
                  color: spentDelta <= 0 ? colors.pos : colors.gold,
                  fontSize: 17,
                  fontWeight: '700',
                  marginTop: 3,
                }}
              >
                {spentDelta <= 0 ? '▾' : '▴'} {Math.abs(spentDelta).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* -------------------------------------------------- six-month bars */}
      <Card>
        <SectionTitle
          right={
            <Text style={{ color: colors.sub, fontSize: 12.5 }}>
              <Text style={{ color: colors.brand }}>■</Text> In{'  '}
              <Text style={{ color: colors.gold }}>■</Text> Out
            </Text>
          }
        >
          Six months
        </SectionTitle>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            minHeight: 150,
          }}
        >
          {months.map((m, i) => {
            const isCurrent = i === months.length - 1
            return (
              <View key={m.label + i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 3,
                    height: 134,
                  }}
                >
                  <View
                    style={{
                      width: 12,
                      height: Math.max(2, Math.round((m.in / peak) * 134)),
                      borderTopLeftRadius: 5,
                      borderTopRightRadius: 5,
                      backgroundColor: colors.brand,
                    }}
                  />
                  <View
                    style={{
                      width: 12,
                      height: Math.max(2, Math.round((m.out / peak) * 134)),
                      borderTopLeftRadius: 5,
                      borderTopRightRadius: 5,
                      backgroundColor: colors.gold,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: isCurrent ? '800' : '600',
                    color: isCurrent ? colors.goldInk : colors.sub,
                  }}
                >
                  {m.label}
                </Text>
              </View>
            )
          })}
        </View>
      </Card>

      {/* -------------------------------------------------- where it went */}
      <Card>
        <SectionTitle>
          Where it went · {formatMoney(spent)}
        </SectionTitle>
        {byCategory.length === 0 ? (
          <Text style={{ color: colors.sub, fontSize: 13.5 }}>
            Nothing spent yet this month.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {byCategory.map(([name, value], i) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text
                  style={{
                    width: 96,
                    fontSize: 13,
                    fontWeight: '600',
                    color: name === 'Everything else' ? colors.sub : colors.ink,
                  }}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <View style={{ flex: 1, height: 10, borderRadius: 999, backgroundColor: colors.soft, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      width: `${spent > 0 ? (value / spent) * 100 : 0}%`,
                      backgroundColor: i % 2 === 0 ? colors.brand : colors.gold,
                      opacity: 1 - i * 0.12,
                    }}
                  />
                </View>
                <Text style={{ width: 64, textAlign: 'right', fontSize: 12.5, color: colors.sub, fontVariant: ['tabular-nums'] }}>
                  {Math.round(value).toLocaleString('en-PK')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* ------------------------------------------------- accounts preview */}
      <Card>
        <SectionTitle
          right={
            <Pressable onPress={() => router.push('/accounts')}>
              <Text style={{ color: colors.goldInk, fontSize: 13.5, fontWeight: '600' }}>
                Manage
              </Text>
            </Pressable>
          }
        >
          Accounts
        </SectionTitle>
        <View>
          {accounts.slice(0, 4).map((a, i) => (
            <View key={a.account_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
              <Avatar size={38} tone={a.type === 'cash' ? 'neutral' : i % 2 === 0 ? 'brand' : 'gold'}>
                {a.type === 'cash' ? '₨' : a.name.trim()[0]?.toUpperCase() ?? '?'}
              </Avatar>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={{ color: colors.sub, fontSize: 12.5, textTransform: 'capitalize' }}>
                  {a.type.replace('_', ' ')}
                </Text>
              </View>
              <Money value={a.balance} currency={a.currency} style={{ color: colors.ink, fontSize: 14.5 }} />
            </View>
          ))}
          {accounts.length === 0 && (
            <Text style={{ color: colors.sub, fontSize: 13.5 }}>
              No accounts yet. Add one to see balances here.
            </Text>
          )}
        </View>
      </Card>

      {/* ------------------------------------------------------ inbox nudge */}
      {inboxCount > 0 && (
        <Pressable
          onPress={() => router.push('/inbox')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.gold,
            backgroundColor: colors.goldSoft,
            paddingHorizontal: 18,
            paddingVertical: 16,
          }}
        >
          <Text style={{ flex: 1, color: colors.ink, fontSize: 13.5 }}>
            <Text style={{ fontWeight: '800' }}>
              {inboxCount} {inboxCount === 1 ? 'item' : 'items'}
            </Text>{' '}
            waiting for review.
          </Text>
          <View style={{ backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: colors.brandOn, fontSize: 13, fontWeight: '700' }}>Review</Text>
          </View>
        </Pressable>
      )}

      {/* --------------------------------------------------- recent activity */}
      <Card>
        <SectionTitle
          right={
            <Pressable onPress={() => router.push('/activity')}>
              <Text style={{ color: colors.goldInk, fontSize: 13.5, fontWeight: '600' }}>
                See all
              </Text>
            </Pressable>
          }
        >
          Recent activity
        </SectionTitle>
        {recent.length === 0 ? (
          <Text style={{ color: colors.sub, fontSize: 13.5, lineHeight: 20 }}>
            Nothing recorded yet. Connect your phone in Settings and it starts
            filling itself.
          </Text>
        ) : (
          recent.map((t) => (
            <View
              key={t.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingVertical: 10,
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
          ))
        )}
      </Card>
    </Screen>
  )
}
