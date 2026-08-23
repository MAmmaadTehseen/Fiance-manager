import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '../lib/session'
import { useColors } from '../lib/useTheme'

/**
 * Entry gate. There is only one question worth asking at launch — signed in
 * or not — and the answer decides which screen the user lands on. Signed in
 * goes to the tabbed app; the capture setup is reached from Settings.
 */
export default function Index() {
  const { session, loading } = useSession()
  const colors = useColors()

  useEffect(() => {
    if (loading) return
    router.replace(session ? '/home' : '/sign-in')
  }, [session, loading])

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <ActivityIndicator color={colors.brand} />
    </View>
  )
}
