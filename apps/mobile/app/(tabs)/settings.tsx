/**
 * Settings — who you are, connecting the phone's capture, appearance, sign out.
 * The theme control lives here and only here, matching the web app's placement.
 */
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { getSupabase } from '@batwa/core'
import { Card, Screen, ScreenHeader } from '../../components/ui'
import { ConnectEmail } from '../../components/ConnectEmail'
import { ManageCategories } from '../../components/ManageCategories'
import { ManagePayees } from '../../components/ManagePayees'
import { useColors, useTheme } from '../../lib/useTheme'
import { useSession } from '../../lib/session'

function initialOf(name: string | null | undefined, email: string | undefined) {
  return (name?.trim()?.[0] ?? email?.[0] ?? '?').toUpperCase()
}

export default function SettingsScreen() {
  const colors = useColors()
  const { scheme, isSystem, toggleTheme } = useTheme()
  const { session } = useSession()
  const dark = scheme === 'dark'

  const user = session?.user
  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? null

  async function signOut() {
    await getSupabase().auth.signOut()
    router.replace('/sign-in')
  }

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      {/* --------------------------------------------------------- who */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.brandOn, fontSize: 18, fontWeight: '800' }}>
              {initialOf(displayName, user?.email)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '700' }}>
              {displayName ?? 'Your account'}
            </Text>
            <Text style={{ color: colors.sub, fontSize: 13.5, marginTop: 2 }} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
      </Card>

      {/* ---------------------------------------------------- capture */}
      <Pressable onPress={() => router.push('/capture')}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '700' }}>
                Connect this phone
              </Text>
              <Text style={{ color: colors.sub, fontSize: 13.5, marginTop: 3, lineHeight: 19 }}>
                Catch bank SMS and the alerts banking apps push, even when
                Batwa is closed.
              </Text>
            </View>
            <Text style={{ color: colors.sub, fontSize: 22 }}>›</Text>
          </View>
        </Card>
      </Pressable>

      {/* ------------------------------------------------------ email */}
      <ConnectEmail />

      {/* ------------------------------------------------- categories */}
      <ManageCategories />

      {/* ----------------------------------------------------- payees */}
      <ManagePayees />

      {/* ------------------------------------------------- appearance */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '700' }}>
              Appearance
            </Text>
            <Text style={{ color: colors.sub, fontSize: 13.5, marginTop: 3, lineHeight: 19 }}>
              {dark
                ? 'Dark — easy on late-night ledger checks.'
                : 'Light — the default cream look.'}
              {isSystem ? ' Following your device.' : ''}
            </Text>
          </View>
          <Pressable
            onPress={toggleTheme}
            style={{
              height: 40,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.soft,
              paddingHorizontal: 18,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>
              {dark ? '☀  Light mode' : '☾  Dark mode'}
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* --------------------------------------------------- sign out */}
      <Pressable
        onPress={signOut}
        style={{
          height: 46,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.neg, fontSize: 14, fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </Screen>
  )
}
