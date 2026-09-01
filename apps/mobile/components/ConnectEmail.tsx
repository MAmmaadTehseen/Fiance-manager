import { useEffect, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useURL } from 'expo-linking'
import Constants from 'expo-constants'
import {
  useConnectGmail,
  useDisconnectGmail,
  useEmailAccount,
  useSyncGmail,
} from '@batwa/core'

import { Card, SectionTitle } from './ui'
import { useColors } from '../lib/useTheme'

/**
 * "Connect Gmail" on the phone — the twin of the web control.
 *
 * Email is the capture channel that covers the banks which never send SMS, and
 * it was reachable only from the website. Someone using the Android app had to
 * go and find a browser, sign in again there, and connect from a device they
 * were not holding.
 *
 * The flow deliberately uses `Linking` rather than an in-app browser: the app
 * bundle updates over the air, and an in-app browser is a native module, so
 * depending on one would mean this feature could not reach an installed phone
 * without a fresh APK. Android's own browser handles Google's consent screen
 * and the app scheme brings the user back.
 */
export function ConnectEmail() {
  const colors = useColors()
  const { data: account, isLoading, refetch } = useEmailAccount()
  const connect = useConnectGmail()
  const disconnect = useDisconnectGmail()
  const sync = useSyncGmail()

  const [flash, setFlash] = useState<'connected' | 'error' | null>(null)
  const url = useURL()

  // Google sends the browser to batwadev://settings?gmail=connected, which
  // Android delivers here as the app is brought back to the front.
  useEffect(() => {
    if (!url) return
    const q = url.split('?')[1]
    if (!q) return
    const g = new URLSearchParams(q).get('gmail')
    if (g !== 'connected' && g !== 'error') return
    setFlash(g)
    if (g === 'connected') {
      void refetch()
      // The first pull runs now rather than waiting for the 15-minute cron, so
      // mail appears while the user is still looking at the screen.
      sync.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  async function start() {
    setFlash(null)
    try {
      const scheme = Constants.expoConfig?.scheme
      const appLink = `${Array.isArray(scheme) ? scheme[0] : (scheme ?? 'batwa')}://settings`
      const authUrl = await connect.mutateAsync(appLink)
      await Linking.openURL(authUrl)
    } catch {
      setFlash('error')
    }
  }

  const lastChecked = account?.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Auto-capture from email</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, color: colors.sub, lineHeight: 19 }}>
          Connect Gmail and Batwa reads your bank&rsquo;s transaction emails on
          its own — nothing to forward, no filters to set up.
        </Text>
        {/* Said here because the alternative is connecting Gmail, seeing
            nothing from a wallet, and concluding the app is broken. */}
        <Text style={{ fontSize: 12.5, color: colors.sub, lineHeight: 18 }}>
          Banks that email — Meezan, Faysal and the like — file themselves this
          way. SadaPay and JazzCash send no email at all; those arrive only by
          SMS, which this app already reads.
        </Text>

        {flash === 'connected' ? (
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.pos }}>
            Gmail connected — bank emails will start filing themselves.
          </Text>
        ) : null}
        {flash === 'error' ? (
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.neg }}>
            That didn&rsquo;t complete. Try connecting again.
          </Text>
        ) : null}

        {isLoading ? (
          <Text style={{ fontSize: 13, color: colors.sub }}>Checking…</Text>
        ) : account ? (
          <View style={{ gap: 10 }}>
            <View>
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}
              >
                ✓ {account.email_address}
              </Text>
              <Text style={{ fontSize: 12, color: colors.sub, marginTop: 2 }}>
                {sync.isPending
                  ? 'Checking your inbox…'
                  : sync.data
                    ? `Filed ${sync.data.filed ?? 0} of ${sync.data.scanned ?? 0} scanned`
                    : lastChecked
                      ? `Last checked ${lastChecked}`
                      : 'Connected — first check runs shortly'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={sync.isPending}
                onPress={() => sync.mutate()}
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.line,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  opacity: sync.isPending ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
                  {sync.isPending ? 'Syncing…' : 'Sync now'}
                </Text>
              </Pressable>
              <Pressable
                disabled={disconnect.isPending}
                onPress={() => disconnect.mutate(account.id)}
                hitSlop={8}
                style={{ justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.sub }}>
                  Disconnect
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            disabled={connect.isPending}
            onPress={() => void start()}
            style={{
              borderRadius: 12,
              backgroundColor: colors.brand,
              paddingVertical: 13,
              alignItems: 'center',
              opacity: connect.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.brandOn }}>
              {connect.isPending ? 'Opening Google…' : 'Connect Gmail'}
            </Text>
          </Pressable>
        )}
      </Card>
    </View>
  )
}
