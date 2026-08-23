import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSupabase } from '@batwa/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell, FormError } from './AuthShell'

/**
 * Where a password-recovery email link lands.
 *
 * The link carries a recovery token that supabase-js exchanges for a session
 * as the page loads (detectSessionInUrl). That exchange is async, so we wait
 * for the session — via getSession or the PASSWORD_RECOVERY event — before
 * offering the form, and only call it a dead link once neither arrives.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>(
    'checking',
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (active && data.session) setStatus('ready')
      })

    const { data: sub } = getSupabase().auth.onAuthStateChange(
      (event, session) => {
        if (!active) return
        if (event === 'PASSWORD_RECOVERY' || session) setStatus('ready')
      },
    )

    // If the token exchange never produces a session, the link is stale or was
    // opened directly. Give it a moment before saying so, to avoid racing the
    // async exchange above.
    const timer = setTimeout(() => {
      if (active) setStatus((s) => (s === 'checking' ? 'invalid' : s))
    }, 3000)

    return () => {
      active = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')

    setBusy(true)
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({
        password,
      })
      if (updateError) throw updateError
      setDone(true)
      // The recovery session is a real session, so send them into the app.
      setTimeout(() => navigate('/', { replace: true }), 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="Signing you in…"
        footer={null}
      >
        <p className="text-sm text-muted-foreground">
          Your new password is set. Taking you to your ledger.
        </p>
      </AuthShell>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Password reset links can only be used once, and time out."
        footer={
          <Link to="/sign-in" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Head back to sign in and choose <strong>Forgot password?</strong> to
          get a fresh link.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something you'll remember this time."
      footer={
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            disabled={status !== 'ready'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            disabled={status !== 'ready'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy || status !== 'ready'}
          className="mt-2"
        >
          {status === 'checking'
            ? 'Checking link…'
            : busy
              ? 'Saving…'
              : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  )
}
