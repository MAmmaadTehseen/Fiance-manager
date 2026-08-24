import Constants from 'expo-constants'

/**
 * Which environment this build belongs to.
 *
 * `app.config.ts` decides this from the Supabase URL at build time and passes
 * it through `extra`; everything that must differ between the dev and the real
 * app reads it from here. Kept apart from `supabase.ts` so that asking "is this
 * production?" does not drag the database client into a module — the update
 * checker needs the answer and has nothing to do with Supabase.
 *
 * Defaults to `false`: an unknown build is treated as dev, never as production.
 */
const extra = Constants.expoConfig?.extra ?? {}

export const isProductionBuild = extra.isProduction === true

/**
 * The web app that pairs with this build.
 *
 * Sign-up happens on the web, and an account created on the wrong one simply
 * will not exist in this build's database — the two environments have separate
 * user tables. So the link a dev build shows has to be the dev site.
 */
export const webOrigin = isProductionBuild
  ? 'https://batwa.online'
  : 'https://dev.batwa.online'

/** Where production looks for news of a newer APK. See `useAppUpdate`. */
export const versionManifestUrl = 'https://batwa.online/app-version.json'
