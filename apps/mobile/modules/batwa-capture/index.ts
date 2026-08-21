/**
 * Native SMS capture.
 *
 * JavaScript stores the credential and reads status; it never handles a
 * message. Capture runs in a manifest-registered receiver, a notification
 * listener and a WorkManager job, because when a bank texts you the app is
 * almost always dead and there is no JS runtime to deliver anything to.
 */
export { default as BatwaCapture } from './src/BatwaCaptureModule'
export type { CaptureStatus } from './src/BatwaCapture.types'
