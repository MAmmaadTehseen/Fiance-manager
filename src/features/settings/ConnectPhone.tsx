import { useState } from 'react'
import { Check, Copy, Smartphone, Trash2, TriangleAlert } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useIngestTokens,
  useCreateIngestToken,
  useRevokeIngestToken,
  webhookUrl,
} from '@/hooks/useIngest'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is blocked outside a secure context; the value is on screen
      // and selectable, so this is recoverable by hand.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-2.5 font-mono text-xs">
          {value}
        </code>
        <Button variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}

/** During local development the API lives on loopback, which a phone on the
 *  same Wi-Fi cannot reach — it has to be told this machine's LAN address. */
function isLoopback(url: string): boolean {
  return /(?:localhost|127\.0\.0\.1|\[::1\])/.test(url)
}

export function ConnectPhone() {
  const { data: tokens = [] } = useIngestTokens()
  const create = useCreateIngestToken()
  const revoke = useRevokeIngestToken()

  const [label, setLabel] = useState('My phone')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [lanHost, setLanHost] = useState('')

  const local = isLoopback(webhookUrl)

  // Accepts either a bare host ("192.168.1.5:54321") or a full origin
  // ("https://something.trycloudflare.com"). A tunnel is https, a LAN address
  // is http, so the scheme has to come from what was typed rather than be
  // assumed.
  const reachableAt = lanHost.trim().replace(/\/+$/, '')
  const path = webhookUrl.slice(webhookUrl.indexOf('/functions/'))
  const effectiveUrl =
    local && reachableAt
      ? reachableAt.includes('://')
        ? `${reachableAt}${path}`
        : `http://${reachableAt}${path}`
      : webhookUrl

  async function issue() {
    const { token } = await create.mutateAsync(label)
    setFreshToken(token)
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Smartphone className="size-4" aria-hidden />
          Connect your phone
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A web app cannot read SMS — no browser API exists. A forwarder app on
          your phone sends bank messages here, and everything else is automatic.
        </p>
      </div>

      {freshToken && (
        <Card className="border-primary p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            Copy this now — it is shown once
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Only a hash is stored, so it cannot be shown again. Lost one? Revoke
            it and issue another.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <CopyRow label="Ingest token" value={freshToken} />
            <CopyRow label="Webhook URL" value={effectiveUrl} />
          </div>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setFreshToken(null)}
          >
            Done, I&rsquo;ve saved it
          </Button>
        </Card>
      )}

      {local && (
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            This app is running locally
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your phone cannot reach <code className="font-mono">127.0.0.1</code>{' '}
            — that address means &ldquo;this device&rdquo;. Paste a tunnel URL
            (from <code className="font-mono">cloudflared</code>) or this
            computer&rsquo;s Wi-Fi address with its port. Once deployed, this
            whole box disappears.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="lan-host">Address your phone can reach</Label>
            <Input
              id="lan-host"
              value={lanHost}
              onChange={(e) => setLanHost(e.target.value)}
              placeholder="https://xyz.trycloudflare.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
          {lanHost.trim() && (
            <div className="mt-3">
              <CopyRow label="Webhook URL for your phone" value={effectiveUrl} />
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-label">Device name</Label>
          <Input
            id="device-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Pixel 7"
          />
        </div>
        <Button
          className="mt-3 w-full"
          onClick={() => void issue()}
          disabled={create.isPending || !label.trim()}
        >
          {create.isPending ? 'Generating…' : 'Generate token'}
        </Button>
      </Card>

      {tokens.length > 0 && (
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
                  aria-label={`Revoke ${t.label}`}
                  onClick={() => revoke.mutate(t.id)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-medium">Setting up MacroDroid</h3>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-4 text-sm text-muted-foreground">
          <li>Install MacroDroid from the Play Store (the free tier is enough).</li>
          <li>
            Add a macro with trigger <strong>Applications &rarr; SMS Received</strong>.
            Leave the sender blank to catch everything, or list your bank sender
            IDs.
          </li>
          <li>
            Add action <strong>Connectivity &rarr; HTTP Request</strong>, method
            POST, to <code className="break-all font-mono text-xs">{effectiveUrl}</code>.
          </li>
          <li>
            Add header <code className="font-mono text-xs">X-Ingest-Token</code>{' '}
            set to your token.
          </li>
          <li>
            Set content type <code className="font-mono text-xs">application/json</code>{' '}
            and body:
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-xs">
              {`{"sender":"[sms_sender]","body":"[sms_message]"}`}
            </pre>
          </li>
          <li>Save and enable it. Send yourself a test SMS to check.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Messages that aren&rsquo;t from a bank are ignored, and anything the
          app can&rsquo;t read is kept so a rule can rescue it later. Nothing is
          thrown away.
        </p>
      </Card>
    </section>
  )
}
