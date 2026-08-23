package expo.modules.batwacapture

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS surface of capture.
 *
 * Deliberately thin. JavaScript only ever stores the credential, reads status
 * and opens settings screens — it never sees a message. Capture itself runs
 * entirely in the receiver, the listener and the worker, because the app is
 * usually not running when a bank texts you and there is no JS runtime to
 * hand anything to.
 */
class BatwaCaptureModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

    override fun definition() = ModuleDefinition {
        Name("BatwaCapture")

        /**
         * Stores the ingest credential. Called once, after the app has signed
         * in and minted a token — which is why the user never copies one by
         * hand the way the MacroDroid setup required.
         */
        Function("configure") { token: String, endpoint: String, tokenHash: String ->
            CaptureStore.setConfig(context, token, endpoint, tokenHash)
            // Anything captured before setup completed can go out now.
            UploadWorker.schedule(context)
        }

        // The stored token's hash, so the app can revoke the exact server-side
        // credential on disconnect without holding the raw token in JS.
        Function("tokenHash") {
            CaptureStore.tokenHash(context)
        }

        Function("disconnect") {
            CaptureStore.clearConfig(context)
        }

        Function("isConfigured") {
            CaptureStore.isConfigured(context)
        }

        /** Everything the setup screen needs to tell the user where it stands. */
        Function("getStatus") {
            mapOf(
                "configured" to CaptureStore.isConfigured(context),
                "pending" to CaptureStore.pendingCount(context),
                "sent" to CaptureStore.sentCount(context),
                "lastSentAt" to CaptureStore.lastSentAt(context),
                "lastError" to CaptureStore.lastError(context),
                "notificationAccess" to hasNotificationAccess(),
            )
        }

        /** "Send now" — used after granting permissions, or to prove it works. */
        Function("flushNow") {
            UploadWorker.scheduleNow(context)
        }

        /**
         * Notification access cannot be requested with a runtime prompt; it is
         * a Settings screen the user has to visit.
         */
        Function("hasNotificationAccess") {
            hasNotificationAccess()
        }

        Function("openNotificationAccessSettings") {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        /**
         * Aggressive OEM battery managers (Xiaomi, Oppo, Vivo, Samsung) will
         * stop WorkManager running, which looks exactly like the app silently
         * missing transactions. Sending the user here is the only fix.
         */
        Function("openBatterySettings") {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        /** For the "it isn't working" path: feed a message in by hand. */
        Function("captureForTesting") { sender: String, body: String ->
            CaptureStore.enqueue(context, sender, body, System.currentTimeMillis())
            UploadWorker.scheduleNow(context)
        }
    }

    private fun hasNotificationAccess(): Boolean =
        try {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE)
                as NotificationManager
            manager.isNotificationListenerAccessGranted(
                android.content.ComponentName(context, BatwaNotificationListener::class.java),
            )
        } catch (t: Throwable) {
            // isNotificationListenerAccessGranted is API 27+; fall back to the
            // secure setting, which is what it reads underneath.
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            )
            enabled?.contains(context.packageName) == true
        }
}
