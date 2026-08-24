import { NativeModule, requireNativeModule } from 'expo'

import type { CaptureCandidate, CaptureStatus } from './BatwaCapture.types'

declare class BatwaCaptureModule extends NativeModule {
  /** Store the ingest credential. Called once, after sign-in. */
  configure(token: string, endpoint: string, tokenHash: string): void
  /** The stored token's SHA-256 hash, for revoking on disconnect. */
  tokenHash(): string | null
  /** Forget the credential. Queued messages are kept. */
  disconnect(): void
  isConfigured(): boolean
  getStatus(): CaptureStatus
  /** Drain the queue immediately rather than waiting for the scheduler. */
  flushNow(): void
  /**
   * Apps seen posting a money alert that have not been approved yet. Package
   * name and label only — an unapproved app's text is never stored.
   */
  captureCandidates(): CaptureCandidate[]
  /** Packages captured from, beyond the default SMS app. */
  allowedPackages(): string[]
  /** Start capturing this app's notifications. */
  allowPackage(packageName: string): void
  /** Stop capturing it, and stop offering it. */
  denyPackage(packageName: string): void
  hasNotificationAccess(): boolean
  openNotificationAccessSettings(): void
  openBatterySettings(): void
  /** Feed a message in by hand, to prove the pipe works end to end. */
  captureForTesting(sender: string, body: string): void
}

export default requireNativeModule<BatwaCaptureModule>('BatwaCapture')
