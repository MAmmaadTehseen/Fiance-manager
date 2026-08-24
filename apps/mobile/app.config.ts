import type { ExpoConfig } from 'expo/config'

/**
 * The production Supabase project. Mirrors `PROD_SUPABASE_REF` in
 * apps/web/src/lib/env.ts — if one moves, move both.
 */
const PROD_SUPABASE_REF = 'byjytsoeayopmcaabgyj'

/**
 * Which environment is this build?
 *
 * Derived from the database it is pointed at rather than from a separate flag,
 * because the database is what actually matters: a build that writes to the
 * real ledger IS production, whatever profile produced it. Safe by default —
 * anything not explicitly aimed at the prod project is treated as dev, never
 * the other way round.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const isProduction = supabaseUrl.includes(PROD_SUPABASE_REF)

/**
 * Android identifies an app by its package, so dev and prod must differ or the
 * one overwrites the other on the device — which is exactly what happened
 * before: installing a test build replaced the real app, and there was no way
 * to hold both. Distinct package, name and scheme let them live side by side.
 */
const identity = isProduction
  ? { name: 'Batwa', scheme: 'batwa', package: 'online.batwa.app' }
  : { name: 'Batwa Dev', scheme: 'batwadev', package: 'online.batwa.app.dev' }

/**
 * Android-only for now. iOS has no API to read SMS and never has, so
 * automatic capture cannot exist there; iPhone users get the PWA.
 */
const config: ExpoConfig = {
  name: identity.name,
  slug: 'batwa',
  scheme: identity.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],

  android: {
    package: identity.package,
    // SDK 57 asset names. The launcher composes foreground over background
    // and crops to its own shape, so the foreground is inset into the safe
    // zone and the background is a flat brand tile.
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#2a473c',
    },
    permissions: [
      // Manifest-registered receiver: fires even when the app is killed,
      // which is the normal state when a bank SMS lands.
      //
      // RECEIVE_SMS is a restricted permission on Google Play, so shipping
      // there means filing the Permissions Declaration Form. Batwa applies
      // under the "SMS-based money management (budget tracking)" permitted
      // use, which is what this app is — not the device-automation exception
      // that Tasker and MacroDroid ship under. Approval is case by case.
      'android.permission.RECEIVE_SMS',
      // READ_SMS is deliberately absent: nothing reads the SMS content
      // provider (capture is broadcast-based). It is a second restricted
      // permission to justify, for a capability the app does not use.
      'android.permission.INTERNET',
      // Lets the retry queue drain after a reboot.
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },

  // The capture module in modules/batwa-capture is auto-linked by Expo, and
  // its own AndroidManifest is merged into the app's — so the receiver and
  // the listener service need no config plugin.
  plugins: [
    'expo-router',
    'expo-updates',
    // Splash is configured through the plugin in SDK 57, not a top-level key.
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#f5f2e9',
        dark: { backgroundColor: '#111c18' },
      },
    ],
  ],

  updates: {
    // Without this url, expo-updates is disabled in built APKs and the whole
    // OTA half is dead: `eas update` publishes bundles no client ever fetches
    // and the in-app update banner can never fire. The u.expo.dev endpoint is
    // derived from the EAS project id.
    url: 'https://u.expo.dev/6d023af2-8e41-404e-b250-3d16f6d61ac6',
    // Over-the-air JS only applies to a build it is compatible with. Tying
    // the runtime to the app version means a native change forces a real
    // build instead of shipping JS that calls a module the binary lacks.
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: { policy: 'appVersion' },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Carried into the bundle so the running app can show the dev marker.
    isProduction,
    // Hard-coded because `eas init` cannot write into a dynamic config, and
    // EAS refuses to build without it. Env var still wins, for forks.
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ?? '6d023af2-8e41-404e-b250-3d16f6d61ac6',
    },
  },
}

export default config
