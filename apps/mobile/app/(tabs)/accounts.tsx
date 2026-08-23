/**
 * Accounts — every place the money sits, and the form to add one. Mirrors the
 * web Accounts page: the largest account gets the brand fill so the eye lands
 * on where most of the money is.
 */
import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import {
  useAccountBalances,
  useCreateAccount,
  formatMoney,
  parseAmount,
  toNumber,
  type AccountType,
  type NewAccount,
} from '@batwa/core'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Money,
  Screen,
  ScreenHeader,
} from '../../components/ui'
import { useColors } from '../../lib/useTheme'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'savings', label: 'Savings' },
]

function AddAccount({ onClose }: { onClose: () => void }) {
  const colors = useColors()
  const create = useCreateAccount()
  const [form, setForm] = useState<NewAccount>({ name: '', type: 'bank' })
  const [opening, setOpening] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!form.name.trim()) return setError('Give the account a name.')
    try {
      await create.mutateAsync({
        ...form,
        name: form.name.trim(),
        opening_balance: parseAmount(opening) ?? 0,
      })
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
            Add account
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
            <Text style={label}>Name</Text>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              placeholder="e.g. Meezan current"
              placeholderTextColor={colors.sub}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  active={form.type === t.value}
                  onPress={() => setForm({ ...form, type: t.value })}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Last digits</Text>
            <TextInput
              value={form.last4 ?? ''}
              onChangeText={(last4) => setForm({ ...form, last4 })}
              placeholder="e.g. 4821"
              placeholderTextColor={colors.sub}
              keyboardType="number-pad"
              maxLength={6}
              style={inputStyle}
            />
            <Text style={{ color: colors.sub, fontSize: 12 }}>
              How bank SMS finds this account automatically. Optional now, needed for SMS capture.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Current balance</Text>
            <TextInput
              value={opening}
              onChangeText={setOpening}
              placeholder="0"
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
            <Text style={{ color: colors.sub, fontSize: 12 }}>
              What&rsquo;s in it right now. Everything is counted from here.
            </Text>
          </View>

          <Button label="Add account" onPress={save} busy={create.isPending} />
        </ScrollView>
      </View>
    </Modal>
  )
}

export default function AccountsScreen() {
  const colors = useColors()
  const [adding, setAdding] = useState(false)
  const { data: accounts = [], isLoading, refetch, isRefetching } =
    useAccountBalances()

  const total = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0)

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <ScreenHeader
        title="Accounts"
        subtitle={
          accounts.length > 0
            ? `${formatMoney(total)} across ${accounts.length} ${accounts.length === 1 ? 'place' : 'places'}.`
            : 'Every place your money sits.'
        }
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

      {!isLoading && accounts.length === 0 ? (
        <Card>
          <EmptyState
            title="No accounts yet"
            description="Add the bank accounts and wallets you actually use, so transactions have somewhere to land."
          />
          <Button label="Add an account" onPress={() => setAdding(true)} />
        </Card>
      ) : (
        <View style={{ gap: 14 }}>
          {accounts.map((a, i) => {
            const featured = i === 0
            return (
              <View
                key={a.account_id}
                style={{
                  borderRadius: 22,
                  padding: 22,
                  gap: 22,
                  backgroundColor: featured ? colors.brand : colors.card,
                  borderWidth: featured ? 0 : 1,
                  borderColor: colors.line,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: featured ? 'rgba(255,255,255,0.14)' : colors.soft,
                    }}
                  >
                    <Text
                      style={{
                        color: featured ? colors.brandOn : colors.sub,
                        fontWeight: '800',
                        fontSize: 17,
                      }}
                    >
                      {a.type === 'cash' ? '₨' : a.name.trim()[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: featured ? colors.brandOn : colors.ink, fontSize: 15, fontWeight: '700' }}
                      numberOfLines={1}
                    >
                      {a.name}
                    </Text>
                    <Text
                      style={{
                        color: featured ? colors.brandOn : colors.sub,
                        opacity: featured ? 0.7 : 1,
                        fontSize: 12.5,
                        textTransform: 'capitalize',
                        marginTop: 1,
                      }}
                    >
                      {a.type.replace('_', ' ')}
                      {a.last4 ? ` · **${a.last4}` : ''}
                    </Text>
                  </View>
                  {a.last4 ? (
                    <View style={{ backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: colors.goldOn, fontSize: 11, fontWeight: '800' }}>SMS</Text>
                    </View>
                  ) : null}
                </View>

                <View>
                  <Text style={{ color: featured ? colors.brandOn : colors.sub, opacity: featured ? 0.7 : 1, fontSize: 12.5 }}>
                    Balance
                  </Text>
                  <Money
                    value={a.balance}
                    currency={a.currency}
                    style={{ color: featured ? colors.brandOn : colors.ink, fontSize: 28, marginTop: 3, fontWeight: '800' }}
                  />
                </View>
              </View>
            )
          })}
        </View>
      )}

      {adding && <AddAccount onClose={() => setAdding(false)} />}
    </Screen>
  )
}
