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
 * Where this build looks for news of a newer APK.
 *
 * It must match the build's own environment. Pointed at production, the dev app
 * would announce production's releases and hand the user production's download
 * link — which, since the two now carry different Android packages, would
 * install over the real app rather than update the dev one.
 */
export const versionManifestUrl = isProductionBuild
  ? 'https://batwa.online/app-version.json'
  : 'https://dev.batwa.online/app-version.json'
