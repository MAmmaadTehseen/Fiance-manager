import type { ExpoConfig } from 'expo/config'

/**
 * Android-only for now. iOS has no API to read SMS and never has, so
 * automatic capture cannot exist there; iPhone users get the PWA.
 */
const config: ExpoConfig = {
  name: 'Batwa',
  slug: 'batwa',
  scheme: 'batwa',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],

  android: {
    package: 'online.batwa.app',
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
      'android.permission.RECEIVE_SMS',
      'android.permission.READ_SMS',
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
    // Over-the-air JS only applies to a build it is compatible with. Tying
    // the runtime to the app version means a native change forces a real
    // build instead of shipping JS that calls a module the binary lacks.
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: { policy: 'appVersion' },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Hard-coded because `eas init` cannot write into a dynamic config, and
    // EAS refuses to build without it. Env var still wins, for forks.
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ?? '6d023af2-8e41-404e-b250-3d16f6d61ac6',
    },
  },
}

export default config
