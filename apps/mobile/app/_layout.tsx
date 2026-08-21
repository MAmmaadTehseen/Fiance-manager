// Polyfills must land before anything touches the network or crypto.
// supabase-js parses URLs, and token generation needs getRandomValues —
// neither exists in the React Native runtime by default.
import 'react-native-url-polyfill/auto'
import 'react-native-get-random-values'

import { useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@batwa/core'

import { bootSupabase } from '../lib/supabase'
import { palette, resolveScheme } from '../lib/theme'
import { SessionContext } from '../lib/session'

bootSupabase()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function RootLayout() {
  const scheme = resolveScheme(useColorScheme())
  const colors = palette[scheme]

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setLoading(false)
      })

    const { data: sub } = getSupabase().auth.onAuthStateChange((_e, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={{ session, loading }}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
            <Stack.Screen name="capture" options={{ title: 'Connect this phone' }} />
          </Stack>
        </SessionContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
