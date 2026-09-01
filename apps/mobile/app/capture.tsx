import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import {
  getSupabase,
  generateIngestToken,
  sha256Hex,
  smsIngestUrl,
} from '@batwa/core'

import {
  BatwaCapture,
  type CaptureCandidate,
  type CaptureStatus,
} from '../modules/batwa-capture'
import type { Colors } from '../lib/theme'
import { useColors } from '../lib/useTheme'
import { useAppUpdate, useOtaUpdate } from '../lib/appUpdate'
import { useSession } from '../lib/session'

/** A human label for the token list, so a user with two phones can tell them
 *  apart when revoking. */
function deviceLabel(): string {
  // Model/Brand exist on Android's PlatformConstants but aren't in the
  // cross-platform type, hence the cast.
  const c = Platform.constants as { Model?: string; Brand?: string }
  const model = c.Model ?? c.Brand
  return model ? `Batwa · ${model}` : 'Batwa Android'
}

function Card({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 20,
        padding: 18,
        gap: 12,
      }}
    >
      {children}
    </View>
  )
}

function Button({
  colors,
  label,
  onPress,
  tone = 'primary',
  busy,
  disabled,
}: {
  colors: Colors
  label: string
  onPress: () => void
  tone?: 'primary' | 'quiet'
  busy?: boolean
  disabled?: boolean
}) {
  const primary = tone === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={{
        height: 46,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        backgroundColor: primary ? colors.brand : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: colors.line,
        opacity: busy || disabled ? 0.6 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.brandOn : colors.ink} />
      ) : (
        <Text
          style={{
            color: primary ? colors.brandOn : colors.ink,
            fontWeight: '700',
            fontSize: 14,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export default function Capture() {
  const colors = useColors()
  const { session } = useSession()

  const { currentVersion, nativeUpdate } = useAppUpdate()
  const ota = useOtaUpdate()

  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [candidates, setCandidates] = useState<CaptureCandidate[]>([])
  const [allowed, setAllowed] = useState<string[]>([])
  const [smsGranted, setSmsGranted] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(BatwaCapture.getStatus())
      setCandidates(BatwaCapture.captureCandidates())
      setAllowed(BatwaCapture.allowedPackages())
      if (Platform.OS === 'android') {
        setSmsGranted(
          await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
          ),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read capture status')
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Permissions and notification access are granted on OS screens, so the
    // only reliable moment to re-check is when the app comes back to the front.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  /**
   * Mint a token and hand it to the native side.
   *
   * The raw token never leaves the device — only its hash is stored server
   * side — and the user never copies anything, which is the whole reason this
   * app exists rather than a hand-wired SMS forwarder.
   *
   * Reconnecting revokes the previous token first, so a device never leaves a
   * trail of live credentials behind it. The insert is done BEFORE the native
   * configure: a device configured with a token the server rejected would
   * fail every upload, whereas a server token the device never stored is inert.
   */
  async function connect() {
    setError(null)
    setConnecting(true)
    try {
      // Only RECEIVE_SMS is used (SmsReceiver is a broadcast receiver); READ_SMS
      // is not requested — nothing reads the SMS provider, and asking for it
      // trips Google Play's restricted-permission review for no benefit.
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      )
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED

      // Revoke whatever this device was using before, so Connect/Disconnect/
      // Connect does not accumulate live tokens.
      const previousHash = BatwaCapture.tokenHash()
      if (previousHash) {
        await getSupabase()
          .from('ingest_tokens')
          .update({ revoked_at: new Date().toISOString() })
          .eq('token_hash', previousHash)
      }

      const token = generateIngestToken()
      const hash = sha256Hex(token)
      const { error: insertError } = await getSupabase()
        .from('ingest_tokens')
        .insert({ token_hash: hash, label: deviceLabel() })
      if (insertError) throw insertError

      // Store the hash too, so a later disconnect can revoke by identity
      // without the raw token.
      BatwaCapture.configure(token, smsIngestUrl(), hash)

      if (!ok) {
        setError(
          'Connected, but SMS permission was refused. Turn on notification access below, or grant SMS in Android settings.',
        )
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect this phone')
    } finally {
      setConnecting(false)
    }
  }

  /** Clears the device AND revokes the server-side token, so the credential
   *  the UI says is gone actually is. */
  async function disconnect() {
    const hash = BatwaCapture.tokenHash()
    BatwaCapture.disconnect()
    if (hash) {
      await getSupabase()
        .from('ingest_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', hash)
    }
    await refresh()
  }

  async function signOut() {
    // A signed-out device that keeps forwarding posts into an account nobody
    // is watching. Revoke the token as part of leaving.
    await disconnect()
    await getSupabase().auth.signOut()
    router.replace('/sign-in')
  }

  const configured = status?.configured ?? false

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.brand} />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>
          Capture
        </Text>
        <Text style={{ fontSize: 14, color: colors.sub }}>
          {session?.user?.email ?? ''}
        </Text>
      </View>

      {ota.ready ? (
        <View
          style={{
            backgroundColor: colors.brandSoft,
            borderColor: colors.brand,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.ink }}>
            An update is ready. Restart to apply it.
          </Text>
          <Button colors={colors} label="Restart now" onPress={() => void ota.applyNow()} />
        </View>
      ) : null}

      {nativeUpdate ? (
        <View
          style={{
            backgroundColor: colors.goldSoft,
            borderColor: colors.gold,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
            New version available ({nativeUpdate.version})
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.sub }}>
            {nativeUpdate.notes ??
              'This one changes the app itself, so it needs installing rather than arriving on its own.'}
          </Text>
          <Button
            colors={colors}
            label="Get the update"
            onPress={() => void Linking.openURL(nativeUpdate.url)}
          />
        </View>
      ) : null}

      {error ? (
        <Text
          style={{
            color: colors.neg,
            backgroundColor: colors.soft,
            borderRadius: 12,
            padding: 12,
            fontSize: 14,
          }}
        >
          {error}
        </Text>
      ) : null}

      {/* ------------------------------------------------------- connection */}
      <Card colors={colors}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: configured ? colors.pos : colors.sub,
            }}
          />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
            {configured ? 'Connected' : 'Not connected'}
          </Text>
        </View>

        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.sub }}>
          {configured
            ? 'Bank messages are forwarded automatically, even when Batwa is closed. Anything captured without signal is kept and sent when you are back online.'
            : 'Connecting stores a key on this device and asks for SMS permission. The key never leaves your phone — only a hash of it is saved.'}
        </Text>

        {!configured ? (
          <Button colors={colors} label="Connect this phone" onPress={connect} busy={connecting} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              colors={colors}
              tone="quiet"
              label="Send now"
              onPress={() => {
                BatwaCapture.flushNow()
                setTimeout(refresh, 1200)
              }}
            />
            <Button
              colors={colors}
              tone="quiet"
              label="Disconnect"
              onPress={() => void disconnect()}
            />
          </View>
        )}
      </Card>

      {/* ----------------------------------------------------------- status */}
      {configured ? (
        <Card colors={colors}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
            Messages
          </Text>
          <View style={{ flexDirection: 'row', gap: 28 }}>
            <View>
              <Text style={{ fontSize: 12, color: colors.sub }}>Sent</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>
                {status?.sent ?? 0}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, color: colors.sub }}>Waiting</Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: (status?.pending ?? 0) > 0 ? colors.gold : colors.ink,
                }}
              >
                {status?.pending ?? 0}
              </Text>
            </View>
          </View>
          {status?.lastError ? (
            <Text style={{ fontSize: 13, color: colors.neg }}>{status.lastError}</Text>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------ reliability */}
      <Card colors={colors}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
          Make it reliable
        </Text>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            SMS permission: {smsGranted ? 'granted' : 'not granted'}
          </Text>

          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            Notification access:{' '}
            {status?.notificationAccess ? 'on' : 'off'} — worth turning on even
            if SMS is working. Since 2025 banks are allowed to stop texting for
            payments you make in their own app and notify you there instead,
            and SMS alerts cost them more than they charge, so more of them are
            moving. Wallets that never text are already only here.
          </Text>
          <Button
            colors={colors}
            tone="quiet"
            label={status?.notificationAccess ? 'Notification settings' : 'Turn on notification access'}
            onPress={() => BatwaCapture.openNotificationAccessSettings()}
          />

          {/* Wallets that push from their own app rather than texting. Listed
              only once one has actually posted a money alert, so this stays
              empty rather than guessing at package names. */}
          {candidates.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>
                {candidates.length === 1
                  ? 'This app posted a transaction alert. Capture from it?'
                  : 'These apps posted transaction alerts. Capture from them?'}
              </Text>
              {candidates.map((candidate) => (
                <View
                  key={candidate.package}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 14, color: colors.ink }}
                  >
                    {candidate.label}
                  </Text>
                  <Button
                    colors={colors}
                    tone="quiet"
                    label="No"
                    onPress={() => {
                      BatwaCapture.denyPackage(candidate.package)
                      void refresh()
                    }}
                  />
                  <Button
                    colors={colors}
                    label="Capture"
                    onPress={() => {
                      BatwaCapture.allowPackage(candidate.package)
                      void refresh()
                    }}
                  />
                </View>
              ))}
              <Text style={{ fontSize: 12, color: colors.sub, lineHeight: 17 }}>
                Until you say yes, Batwa keeps only the app&rsquo;s name — never
                what the alert said.
              </Text>
            </View>
          ) : null}

          {allowed.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
                Also capturing from:
              </Text>
              {allowed.map((packageName) => (
                <View
                  key={packageName}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 14, color: colors.ink }}
                  >
                    {packageName}
                  </Text>
                  <Button
                    colors={colors}
                    tone="quiet"
                    label="Stop"
                    onPress={() => {
                      BatwaCapture.denyPackage(packageName)
                      void refresh()
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            Battery optimisation will stop Batwa forwarding in the background.
            Set it to unrestricted — on Xiaomi, Oppo, Vivo and Samsung this is
            the usual reason messages go missing.
          </Text>
          <Button
            colors={colors}
            tone="quiet"
            label="Battery settings"
            onPress={() => BatwaCapture.openBatterySettings()}
          />
        </View>
      </Card>

      {/* ------------------------------------------------------------ prove */}
      {configured ? (
        <Card colors={colors}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
            Test it
          </Text>
          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            Sends one test message through the real pipeline to prove your
            phone can forward. It is recognised as a test and never becomes a
            transaction.
          </Text>
          <Button
            colors={colors}
            tone="quiet"
            label="Send a test message"
            onPress={() => {
              // Deliberately an OTP-shaped message: it travels the whole
              // pipe and lands as 'ignored', proving capture works without
              // inventing a transaction or a phantom card in the ledger.
              BatwaCapture.captureForTesting(
                'BATWA-TEST',
                'Batwa test OTP is 000000. This confirms your phone can forward messages.',
              )
              setTimeout(refresh, 1500)
            }}
          />
        </Card>
      ) : null}

      <Button colors={colors} tone="quiet" label="Sign out" onPress={signOut} />

      <Text style={{ fontSize: 12, color: colors.sub, textAlign: 'center' }}>
        Batwa {currentVersion}
      </Text>
    </ScrollView>
  )
}
