import { NativeModule, requireNativeModule } from 'expo'

import type { CaptureStatus } from './BatwaCapture.types'

declare class BatwaCaptureModule extends NativeModule {
  /** Store the ingest credential. Called once, after sign-in. */
  configure(token: string, endpoint: string): void
  /** Forget the credential. Queued messages are kept. */
  disconnect(): void
  isConfigured(): boolean
  getStatus(): CaptureStatus
  /** Drain the queue immediately rather than waiting for the scheduler. */
  flushNow(): void
  hasNotificationAccess(): boolean
  openNotificationAccessSettings(): void
  openBatterySettings(): void
  /** Feed a message in by hand, to prove the pipe works end to end. */
  captureForTesting(sender: string, body: string): void
}

export default requireNativeModule<BatwaCaptureModule>('BatwaCapture')
