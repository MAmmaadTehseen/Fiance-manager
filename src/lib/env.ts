/**
 * Fail loudly at boot rather than with an opaque network error later.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required(
    'VITE_SUPABASE_URL',
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
  ),
  supabaseAnonKey: required(
    'VITE_SUPABASE_ANON_KEY',
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  ),
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
}
