import { useEffect, useState } from 'react'
import { Check, Mail, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  useConnectGmail,
  useDisconnectGmail,
  useEmailAccount,
} from '@batwa/core'

/**
 * "Connect Gmail" — the one-tap path. The button sends the user to Google's own
 * consent screen; the server stores the token and reads only bank mail. No
 * filters, no forwarding, nothing to configure by hand.
 */
export function ConnectEmail() {
  const { data: account, isLoading } = useEmailAccount()
  const connect = useConnectGmail()
  const disconnect = useDisconnectGmail()

  // The OAuth callback lands back here with ?gmail=connected|error.
  const [flash, setFlash] = useState<'connected' | 'error' | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('gmail')
    if (g === 'connected' || g === 'error') {
      setFlash(g)
      params.delete('gmail')
      const qs = params.toString()
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? `?${qs}` : ''),
      )
    }
  }, [])

  async function start() {
    try {
      const url = await connect.mutateAsync(window.location.origin)
      window.location.href = url
    } catch {
      setFlash('error')
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mail className="size-4" aria-hidden />
          Auto-capture from email
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Gmail and Batwa reads your bank&rsquo;s transaction emails on
          its own — no SMS, no forwarding to set up. Works on any phone,
          including iPhone.
        </p>
      </div>

      {flash === 'connected' && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          Gmail connected — bank emails will start filing themselves.
        </p>
      )}
      {flash === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          That didn&rsquo;t complete. Try connecting again.
        </p>
      )}

      <Card className="p-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Checking…
          </p>
        ) : account ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
                {account.email_address}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {account.last_synced_at
                  ? `Last checked ${format(parseISO(account.last_synced_at), 'd MMM, HH:mm')}`
                  : 'Connected — first check runs shortly'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnect.mutate(account.id)}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => void start()}
            disabled={connect.isPending}
            className="w-full"
          >
            <Mail className="size-4" aria-hidden />
            {connect.isPending ? 'Opening Google…' : 'Connect Gmail'}
          </Button>
        )}
      </Card>
    </section>
  )
}
