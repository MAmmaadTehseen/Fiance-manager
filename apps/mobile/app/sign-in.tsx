import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native'
import { router } from 'expo-router'
import { getSupabase } from '@batwa/core'

import { palette, resolveScheme } from '../lib/theme'

export default function SignIn() {
  const colors = palette[resolveScheme(useColorScheme())]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword(
        { email: email.trim(), password },
      )
      if (signInError) throw signInError
      router.replace('/capture')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  const field = {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    paddingHorizontal: 14,
    // 16px stops Android shrinking the text and keeps it legible.
    fontSize: 16,
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>
            batwa<Text style={{ color: colors.gold }}>.</Text>
          </Text>
          <Text style={{ fontSize: 15, color: colors.sub }}>
            Sign in to connect this phone to your ledger.
          </Text>
        </View>

        {error ? (
          <Text
            style={{
              color: colors.neg,
              backgroundColor: colors.soft,
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.sub }}>Email</Text>
          <TextInput
            style={field}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholderTextColor={colors.sub}
            placeholder="you@example.com"
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.sub }}>Password</Text>
          <TextInput
            style={field}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholderTextColor={colors.sub}
          />
        </View>

        <Pressable
          onPress={submit}
          disabled={busy || !email || !password}
          style={{
            height: 50,
            borderRadius: 14,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy || !email || !password ? 0.6 : 1,
            marginTop: 4,
          }}
        >
          {busy ? (
            <ActivityIndicator color={colors.brandOn} />
          ) : (
            <Text style={{ color: colors.brandOn, fontWeight: '700', fontSize: 15 }}>
              Sign in
            </Text>
          )}
        </Pressable>

        <Text style={{ fontSize: 13, color: colors.sub, textAlign: 'center' }}>
          No account yet? Create one at batwa.online, then sign in here.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
