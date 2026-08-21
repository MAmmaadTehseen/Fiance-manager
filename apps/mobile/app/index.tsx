import { useEffect } from 'react'
import { ActivityIndicator, View, useColorScheme } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '../lib/session'
import { palette, resolveScheme } from '../lib/theme'

/**
 * Entry gate. There is only one question worth asking at launch — signed in
 * or not — and the answer decides which screen the user lands on.
 */
export default function Index() {
  const { session, loading } = useSession()
  const colors = palette[resolveScheme(useColorScheme())]

  useEffect(() => {
    if (loading) return
    router.replace(session ? '/capture' : '/sign-in')
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
