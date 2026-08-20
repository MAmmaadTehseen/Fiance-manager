/**
 * Ingest token generation.
 *
 * The raw token is created here, in the browser, and never sent to the server
 * — only its SHA-256 hash is stored. That means a database dump does not hand
 * anyone the ability to post transactions into someone's ledger, and it is why
 * the token can only be shown once.
 */

const TOKEN_BYTES = 24

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generateIngestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return `fmt_${base64url(bytes)}`
}
