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
  /** Whether the notification listener is switched on. */
  notificationAccess: boolean
}

/**
 * An app seen posting a transaction-shaped alert, offered for approval.
 *
 * Carries no notification text: an app the user has not opted into leaves no
 * record of what it said, only that it exists.
 */
export type CaptureCandidate = {
  /** Android package name — the stable identity, used to allow or deny. */
  package: string
  /** The app's own display name, so the prompt can name it. */
  label: string
  /** Epoch millis when it was first noticed. */
  seenAt: number
}
