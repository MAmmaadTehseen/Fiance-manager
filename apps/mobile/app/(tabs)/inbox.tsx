/**
 * Inbox — the teach-once loop, on the phone. Three kinds of card:
 *  · a parked message asking which account a card belongs to,
 *  · a captured transaction that needs a category,
 *  · a message no template could read, kept verbatim so a rule can rescue it.
 * Mirrors the web Inbox, including showing the raw SMS beside the question.
 */
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  useAccounts,
  useAssignCardToAccount,
  useAssignSenderToAccount,
  useCategories,
  useCategorise,
  useDismissMessage,
  useOpenMessages,
  useReprocess,
  useReviewQueue,
  type OpenMessage,
  type ReviewRow,
} from '@batwa/core'
import {
  Card,
  EmptyState,
  Money,
  Screen,
  ScreenHeader,
  Tag,
} from '../../components/ui'
import { useColors } from '../../lib/useTheme'
import { AddCategory } from '../../components/AddCategory'

function ago(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

/** A monospace-ish block holding the original SMS. */
function RawBody({ children, lines }: { children: string; lines?: number }) {
  const colors = useColors()
  return (
    <Text
      numberOfLines={lines}
      style={{
        backgroundColor: colors.soft,
        color: colors.sub,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'monospace',
      }}
    >
      {children}
    </Text>
  )
}

function PickChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 14,
        paddingVertical: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

function DismissButton({
  onPress,
  label = 'Dismiss',
}: {
  onPress: () => void
  label?: string
}) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        height: 40,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: colors.line,
        paddingHorizontal: 16,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.sub, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

// -------------------------------------------------- which account is this?

function UnknownCardCard({ message }: { message: OpenMessage }) {
  const colors = useColors()
  const { data: accounts = [] } = useAccounts()
  const assign = useAssignCardToAccount()
  const assignSender = useAssignSenderToAccount()
  const reprocess = useReprocess()
  const dismiss = useDismissMessage()

  const last4 = message.pending_last4 ?? message.parsed?.last4 ?? ''
  const amount = message.parsed?.amount
  const busy = assign.isPending || assignSender.isPending || reprocess.isPending

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tag>{`${message.sender} · ${ago(message.received_at)}`}</Tag>
        {amount != null && (
          <Money value={amount} style={{ marginLeft: 'auto', color: colors.ink, fontSize: 20 }} />
        )}
      </View>

      <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '700' }}>
        {last4
          ? `Which account is •••• ${last4}?`
          : 'Which account did this come from?'}
      </Text>

      <RawBody>{message.body}</RawBody>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {accounts
          .filter((a) => a.type !== 'cash')
          .map((a) => (
            <PickChip
              key={a.id}
              label={`${a.name}${a.last4 ? ` ••${a.last4}` : ''}`}
              disabled={busy}
              onPress={async () => {
                // A quoted card teaches the card; an alert naming none — an
                // outgoing RAAST, or a bank that masks the number past
                // recognition — teaches the sending bank, the only durable
                // thing left in it. Without this the phone could not answer
                // the question at all and every button sat disabled.
                if (last4)
                  await assign.mutateAsync({
                    accountId: a.id,
                    last4,
                    bank: message.parsed?.bank ?? null,
                  })
                else
                  await assignSender.mutateAsync({
                    accountId: a.id,
                    sender: message.sender,
                  })
              }}
            />
          ))}
      </View>

      <DismissButton onPress={() => dismiss.mutate(message.id)} />

      <Text style={{ color: colors.sub, fontSize: 12 }}>
        {last4
          ? 'Answering once resolves this and every future message from that card.'
          : `Answering once resolves this and every future alert from ${message.sender}.`}
      </Text>
    </Card>
  )
}


// --------------------------------------------- answered, waiting to be read

/**
 * A message that was waiting on you and no longer is. It stays until
 * dismissed: answering "which account is this?" is the moment you most want
 * to read the thing, and it used to vanish on the tap.
 */
function SettledCard({ message }: { message: OpenMessage }) {
  const colors = useColors()
  const dismiss = useDismissMessage()
  const amount = message.parsed?.amount

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tag>{`${message.sender} · ${ago(message.received_at)}`}</Tag>
        {amount != null && (
          <Money value={amount} style={{ marginLeft: 'auto', color: colors.ink, fontSize: 20 }} />
        )}
      </View>

      <Text style={{ color: colors.pos, fontSize: 14.5, fontWeight: '700' }}>
        {message.parse_status === 'duplicate'
          ? '✓ Already had this one'
          : '✓ Sorted — added to your ledger'}
      </Text>

      <RawBody>{message.body}</RawBody>

      <DismissButton label="Done reading" onPress={() => dismiss.mutate(message.id)} />
    </Card>
  )
}

// --------------------------------------------------------- what was this?

function ReviewCard({ tx }: { tx: ReviewRow }) {
  const colors = useColors()
  const categorise = useCategorise()
  const { data: categories = [] } = useCategories(
    tx.type === 'income' ? 'income' : 'expense',
  )

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tag tone="gold">{`${tx.account?.name ?? 'Account'} · ${ago(tx.occurred_at)}`}</Tag>
        <Money
          value={tx.amount}
          currency={tx.currency}
          sign={tx.type === 'income' ? '+' : '−'}
          style={{ marginLeft: 'auto', color: colors.ink, fontSize: 20 }}
        />
      </View>

      {/* The message the bank actually sent. The parsed fields are a summary,
          and a summary is what fails you here: a 2,000 transfer whose payee
          did not parse is unanswerable without the original text. */}
      {tx.sms_message ? <RawBody>{tx.sms_message.body}</RawBody> : null}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: colors.sub, fontSize: 13.5 }}>Merchant</Text>
          <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700', flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
            {tx.merchant?.display_name ?? tx.note ?? 'Unknown'}
          </Text>
        </View>
      </View>

      <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '600' }}>What was this?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => (
          <PickChip
            key={c.id}
            label={c.name}
            disabled={categorise.isPending}
            onPress={() =>
              categorise.mutate({
                transactionId: tx.id,
                categoryId: c.id,
                merchantId: tx.merchant_id,
                type: tx.type,
              })
            }
          />
        ))}

        <AddCategory
          kind={tx.type === 'income' ? 'income' : 'expense'}
          disabled={categorise.isPending}
          onCreated={(category) =>
            categorise.mutate({
              transactionId: tx.id,
              categoryId: category.id,
              merchantId: tx.merchant_id,
              type: tx.type,
            })
          }
        />
      </View>

      {tx.merchant_id ? (
        <Text style={{ color: colors.sub, fontSize: 12 }}>
          Picking one teaches {tx.merchant?.display_name ?? 'this merchant'} — future payments file themselves.
        </Text>
      ) : null}
    </Card>
  )
}

// ------------------------------------------------------ couldn't read this

function UnreadableCard({ message }: { message: OpenMessage }) {
  const colors = useColors()
  const dismiss = useDismissMessage()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <Tag>{`${message.sender} · ${ago(message.received_at)}`}</Tag>
      <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '700' }}>
        Couldn&rsquo;t read this one
      </Text>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <RawBody lines={expanded ? undefined : 3}>{message.body}</RawBody>
      </Pressable>
      <DismissButton onPress={() => dismiss.mutate(message.id)} />
      <Text style={{ color: colors.sub, fontSize: 12 }}>
        It&rsquo;s saved. Add a rule in Settings and it will be picked up.
      </Text>
    </Card>
  )
}

// -------------------------------------------------------------- screen

export default function InboxScreen() {
  const colors = useColors()
  const { data: review = [], isLoading: loadingReview, refetch: refetchReview } =
    useReviewQueue()
  const { data: messages = [], isLoading: loadingMessages, refetch: refetchMessages } =
    useOpenMessages()
  const reprocess = useReprocess()

  const needsAccount = messages.filter((m) => m.parse_status === 'needs_account')
  const unreadable = messages.filter((m) => m.parse_status === 'unmatched')
  const settled = messages.filter(
    (m) =>
      m.resolved_at != null &&
      m.parse_status !== 'needs_account' &&
      m.parse_status !== 'unmatched',
  )
  const total = review.length + messages.length
  const loading = loadingReview || loadingMessages

  function refresh() {
    void refetchReview()
    void refetchMessages()
  }

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <ScreenHeader
        title="Inbox"
        subtitle="Bank SMS your phone forwarded — confirm and they join the ledger."
        right={
          messages.length > 0 ? (
            <Pressable
              onPress={() => reprocess.mutate(undefined)}
              disabled={reprocess.isPending}
              style={{
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                paddingHorizontal: 16,
                justifyContent: 'center',
                opacity: reprocess.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>
                {reprocess.isPending ? 'Retrying…' : 'Retry'}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {!loading && total === 0 ? (
        <Card>
          <EmptyState
            title="Nothing needs you"
            description="Every message so far has been filed on its own. This is what it should look like most days."
          />
        </Card>
      ) : (
        <View style={{ gap: 16 }}>
          {needsAccount.map((m) => (
            <UnknownCardCard key={m.id} message={m} />
          ))}
          {settled.map((m) => (
            <SettledCard key={m.id} message={m} />
          ))}
          {review.map((tx) => (
            <ReviewCard key={tx.id} tx={tx} />
          ))}
          {unreadable.map((m) => (
            <UnreadableCard key={m.id} message={m} />
          ))}
        </View>
      )}
    </Screen>
  )
}
