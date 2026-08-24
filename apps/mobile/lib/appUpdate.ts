import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { isNewer } from '@batwa/core'
import { versionManifestUrl } from './env'

/**
 * Two kinds of "out of date", and they are not interchangeable.
 *
 *  - JS/TS changes ship over the air. expo-updates downloads them silently
 *    and they apply on the next launch; the user needs to do nothing.
 *  - A native change — a new permission, a change in modules/batwa-capture,
 *    an SDK upgrade — cannot be shipped over the air. The APK has to be
 *    replaced, and without being told, someone just quietly runs an old
 *    build forever and wonders why a feature never arrived.
 *
 * This covers the second case, which expo-updates deliberately cannot.
 */

type NativeUpdate = {
  version: string
  url: string
  notes?: string
}

export function useAppUpdate() {
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0'
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdate | null>(null)

  const check = useCallback(async () => {
    try {
      // cache: no-store, or a stale CDN copy hides the very release this
      // exists to announce.
      const res = await fetch(versionManifestUrl, { cache: 'no-store' })
      if (!res.ok) return
      const manifest = (await res.json()) as { android?: NativeUpdate }
      const latest = manifest.android
      if (latest && isNewer(latest.version, currentVersion)) {
        setNativeUpdate(latest)
      } else {
        setNativeUpdate(null)
      }
    } catch {
      // Offline, or the manifest is unreachable. Silence is right here —
      // this is a courtesy, and a failed check must never block the app.
    }
  }, [currentVersion])

  useEffect(() => {
    void check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check()
    })
    return () => sub.remove()
  }, [check])

  return { currentVersion, nativeUpdate, recheck: check }
}

/**
 * The over-the-air half. `isUpdatePending` means new JS is downloaded and
 * waiting; reloading applies it immediately rather than at some later launch.
 */
export function useOtaUpdate() {
  const { isUpdateAvailable, isUpdatePending, isDownloading } = Updates.useUpdates()

  const applyNow = useCallback(async () => {
    try {
      await Updates.reloadAsync()
    } catch {
      // In a dev client reloadAsync is unavailable; nothing to do.
    }
  }, [])

  return {
    // In development the bundle is served by Metro, so an update banner
    // would be noise rather than information.
    ready: !__DEV__ && isUpdatePending,
    available: !__DEV__ && isUpdateAvailable,
    isDownloading,
    applyNow,
  }
}
