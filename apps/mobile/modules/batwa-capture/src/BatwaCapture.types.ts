export type CaptureStatus = {
  /** True once an ingest token has been stored on the device. */
  configured: boolean
  /** Messages captured but not yet accepted by the server. */
  pending: number
  /** Messages the server has accepted, since install. */
  sent: number
  /** Epoch millis of the last successful upload, or 0. */
  lastSentAt: number
  /** Set when the last attempt failed; cleared on the next success. */
  lastError: string | null
  /** Whether the notification-listener fallback is switched on. */
  notificationAccess: boolean
}
