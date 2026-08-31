/**
 * Accounts — every place the money sits, and the sheet to add or correct one.
 * Mirrors the web Accounts page: the largest account gets the brand fill so
 * the eye lands on where most of the money is, and tapping any card opens it
 * for editing.
 */
import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import {
  useAccountBalances,
  useAccounts,
  useCreateAccount,
  useRemoveAccount,
  useUpdateAccount,
  formatMoney,
  parseAmount,
  toNumber,
  type Account,
  type AccountType,
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

/**
 * Add an account, or correct one — the same fields either way, so the same
 * sheet. Accounts used to be create-only, which made a mistyped last4
 * permanent, and that is the field that decides whether a bank message finds
 * its account or lands in the Inbox.
 */
function AccountSheet({
  account,
  onClose,
}: {
  account?: Account
  onClose: () => void
}) {
  const colors = useColors()
  const editing = account != null
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const remove = useRemoveAccount()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [last4, setLast4] = useState(account?.last4 ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [senders, setSenders] = useState<string[]>(account?.sms_senders ?? [])
  const [isPrimary, setIsPrimary] = useState(account?.is_primary ?? false)
  const [opening, setOpening] = useState(
    account ? String(toNumber(account.opening_balance)) : '',
  )
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const busy = create.isPending || update.isPending || remove.isPending

  async function save() {
    setError(null)
    if (!name.trim()) return setError('Give the account a name.')
    try {
      if (editing) {
        await update.mutateAsync({
          id: account.id,
          name,
          type,
          last4,
          institution,
          opening_balance: parseAmount(opening) ?? 0,
          is_primary: isPrimary,
          sms_senders: senders,
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          last4,
          institution,
          opening_balance: parseAmount(opening) ?? 0,
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function drop() {
    setError(null)
    try {
      const result = await remove.mutateAsync(account!.id)
      // Whether history survived is the whole difference, so say it.
      if (result.deleted) onClose()
      else {
        setNote(
          `Hidden, not deleted — ${result.transactions} transaction${result.transactions === 1 ? '' : 's'} still reference it and stay in your ledger.`,
        )
        setConfirming(false)
        setTimeout(onClose, 2200)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove')
      setConfirming(false)
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
            {editing ? 'Edit account' : 'Add account'}
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
          {note && (
            <View style={{ backgroundColor: colors.soft, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: colors.sub, fontSize: 13.5 }}>{note}</Text>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
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
                  active={type === t.value}
                  onPress={() => setType(t.value)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Bank</Text>
            <TextInput
              value={institution}
              onChangeText={setInstitution}
              placeholder="e.g. Meezan Bank"
              placeholderTextColor={colors.sub}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>Last digits</Text>
            <TextInput
              value={last4}
              onChangeText={setLast4}
              placeholder="e.g. 4821"
              placeholderTextColor={colors.sub}
              keyboardType="number-pad"
              maxLength={6}
              style={inputStyle}
            />
            <Text style={{ color: colors.sub, fontSize: 12 }}>
              How bank messages find this account. Get it wrong and they land in
              the Inbox instead.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={label}>
              {editing ? 'Starting balance' : 'Current balance'}
            </Text>
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

          {editing ? (
            <>
              <Pressable
                onPress={() => setIsPrimary((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: isPrimary ? colors.brand : colors.line,
                    backgroundColor: isPrimary ? colors.brand : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isPrimary ? (
                    <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '900' }}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.ink, fontSize: 14 }}>Main account</Text>
                <Text style={{ color: colors.sub, fontSize: 12 }}>(only one can be)</Text>
              </Pressable>

              {senders.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={label}>Senders mapped here</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {senders.map((sender) => (
                      <Pressable
                        key={sender}
                        onPress={() =>
                          setSenders((prev) => prev.filter((x) => x !== sender))
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.line,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: colors.sub, fontSize: 12 }} numberOfLines={1}>
                          {sender}
                        </Text>
                        <Text style={{ color: colors.sub, fontSize: 12 }}>✕</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ color: colors.sub, fontSize: 12 }}>
                    Messages from these are booked here whatever digits they
                    quote. Tap one to unlink it.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          <Button
            label={editing ? 'Save changes' : 'Add account'}
            onPress={save}
            busy={busy}
          />

          {editing ? (
            confirming ? (
              <View
                style={{
                  gap: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.neg,
                  padding: 12,
                }}
              >
                <Text style={{ color: colors.ink, fontSize: 13.5, lineHeight: 19 }}>
                  Remove {account.name}? If it has transactions it is hidden
                  rather than deleted, and they stay in your ledger.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={drop} disabled={busy} hitSlop={8}>
                    <Text style={{ color: colors.neg, fontSize: 14, fontWeight: '700' }}>
                      Remove
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirming(false)} hitSlop={8}>
                    <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '600' }}>
                      Keep it
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
                <Text style={{ color: colors.neg, fontSize: 14, fontWeight: '600' }}>
                  Remove account
                </Text>
              </Pressable>
            )
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

export default function AccountsScreen() {
  const colors = useColors()
  const [adding, setAdding] = useState(false)
  // The id, not the row, so an open sheet reflects the latest fetch.
  const [editing, setEditing] = useState<string | null>(null)
  const { data: accounts = [], isLoading, refetch, isRefetching } =
    useAccountBalances()
  const { data: full = [] } = useAccounts()
  const editingAccount = full.find((a) => a.id === editing)

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
              <Pressable
                key={a.account_id}
                onPress={() => setEditing(a.account_id)}
                accessibilityLabel={`Edit ${a.name}`}
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
              </Pressable>
            )
          })}
        </View>
      )}

      {adding && <AccountSheet onClose={() => setAdding(false)} />}
      {editingAccount && (
        <AccountSheet account={editingAccount} onClose={() => setEditing(null)} />
      )}
    </Screen>
  )
}
