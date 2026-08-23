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

/**
 * The production Supabase project. Anything NOT pointed here — dev.batwa.online,
 * a local stack, a preview build — is treated as non-production and shows the
 * dev banner. Safe by default: a new environment is flagged unless it is
 * explicitly the real project, never the other way round.
 */
const PROD_SUPABASE_REF = 'byjytsoeayopmcaabgyj'

export const isProductionDeploy = env.supabaseUrl.includes(PROD_SUPABASE_REF)
