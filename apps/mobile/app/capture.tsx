import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useColorScheme,
} from 'react-native'
import { router } from 'expo-router'
import {
  getSupabase,
  generateIngestToken,
  sha256Hex,
  smsIngestUrl,
} from '@batwa/core'

import { BatwaCapture, type CaptureStatus } from '../modules/batwa-capture'
import { palette, resolveScheme, type Colors } from '../lib/theme'
import { useSession } from '../lib/session'

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
  const colors = palette[resolveScheme(useColorScheme())]
  const { session } = useSession()

  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [smsGranted, setSmsGranted] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(BatwaCapture.getStatus())
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
   * app exists rather than a MacroDroid macro.
   */
  async function connect() {
    setError(null)
    setConnecting(true)
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      ])
      const ok =
        granted['android.permission.RECEIVE_SMS'] ===
        PermissionsAndroid.RESULTS.GRANTED

      const token = generateIngestToken()
      const { error: insertError } = await getSupabase()
        .from('ingest_tokens')
        .insert({
          token_hash: sha256Hex(token),
          label: 'Batwa Android',
        })
      if (insertError) throw insertError

      BatwaCapture.configure(token, smsIngestUrl())

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

  async function signOut() {
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
              onPress={() => {
                BatwaCapture.disconnect()
                void refresh()
              }}
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
            {status?.notificationAccess ? 'on' : 'off'} — a second way to catch
            alerts, including banks that use their own app instead of SMS.
          </Text>
          <Button
            colors={colors}
            tone="quiet"
            label={status?.notificationAccess ? 'Notification settings' : 'Turn on notification access'}
            onPress={() => BatwaCapture.openNotificationAccessSettings()}
          />

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
            Sends one fake bank message through the real pipeline. It should
            appear in your inbox on the web app within seconds.
          </Text>
          <Button
            colors={colors}
            tone="quiet"
            label="Send a test message"
            onPress={() => {
              BatwaCapture.captureForTesting(
                'BATWA-TEST',
                'PKR 123.00 Debit Card purchase at BATWA TEST from FBL A/C *0000 on 01/JAN/2026 at 12:00:00 PM',
              )
              setTimeout(refresh, 1500)
            }}
          />
        </Card>
      ) : null}

      <Button colors={colors} tone="quiet" label="Sign out" onPress={signOut} />
    </ScrollView>
  )
}
