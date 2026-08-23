import { Link } from 'react-router-dom'
import { Download, Smartphone, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useIngestTokens, useRevokeIngestToken } from '@batwa/core'

/**
 * How a phone gets connected, in the app-first world.
 *
 * The Batwa Android app captures bank SMS itself and mints its own ingest
 * token after sign-in, so there is nothing to copy and no forwarder to set up.
 * This screen just points at the app and lists the phones already connected,
 * so a lost one can be revoked.
 */
export function ConnectPhone() {
  const { data: tokens = [] } = useIngestTokens()
  const revoke = useRevokeIngestToken()

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Smartphone className="size-4" aria-hidden />
          Connect your phone
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Batwa captures your bank SMS through the Android app. Install it, sign
          in with this account, and it connects this phone on its own — no token
          to copy, no other apps to wire up.
        </p>
      </div>

      <Card className="p-4">
        <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm text-muted-foreground">
          <li>
            <Link
              to="/download"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Install the Batwa app
            </Link>{' '}
            on your Android phone.
          </li>
          <li>Sign in with the same account you use here.</li>
          <li>
            Tap <strong>Connect this phone</strong> and allow the SMS
            permission. That&rsquo;s it — bank messages start arriving in your
            Inbox.
          </li>
        </ol>

        <Link
          to="/download"
          className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline transition hover:brightness-110"
        >
          <Download className="size-4" aria-hidden />
          Get the app
        </Link>

        <p className="mt-3 text-xs text-muted-foreground">
          On an iPhone? iOS blocks apps from reading SMS, so automatic capture is
          Android-only. Add this site to your home screen and record spending by
          hand.
        </p>
      </Card>

      {tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Connected phones</h3>
          <ul className="flex flex-col gap-2">
            {tokens.map((t) => (
              <li key={t.id}>
                <Card className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.last_used_at
                        ? `Last message ${format(parseISO(t.last_used_at), 'd MMM, HH:mm')}`
                        : 'Never used'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Disconnect ${t.label}`}
                    onClick={() => revoke.mutate(t.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Revoking a phone stops it forwarding. The app can reconnect it any
            time by tapping Connect this phone again.
          </p>
        </div>
      )}
    </section>
  )
}
