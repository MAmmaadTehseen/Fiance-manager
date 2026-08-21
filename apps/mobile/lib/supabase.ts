import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { initSupabase } from '@batwa/core'

/**
 * Boots the shared client for React Native.
 *
 * Two differences from web, both required: the session lives in AsyncStorage
 * because there is no localStorage, and URL-based session detection is off
 * because there is no URL bar for a magic link to land in.
 */
const extra = Constants.expoConfig?.extra ?? {}

const url = (extra.supabaseUrl as string | undefined) ?? ''
const anonKey = (extra.supabaseAnonKey as string | undefined) ?? ''

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in.',
  )
}

export const supabaseUrl = url

export function bootSupabase() {
  return initSupabase({
    url,
    anonKey,
    storage: AsyncStorage,
    detectSessionInUrl: false,
  })
}
