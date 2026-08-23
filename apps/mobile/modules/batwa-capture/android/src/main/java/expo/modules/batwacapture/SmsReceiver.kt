package expo.modules.batwacapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Catches incoming SMS.
 *
 * Declared in the manifest rather than registered from JavaScript, because
 * when a bank texts you the app is almost always dead — and a JS-registered
 * receiver only exists while the app is running. Android starts the process
 * to deliver this.
 *
 * onReceive runs on the main thread with roughly ten seconds before the
 * process may be killed, so it does the least possible: persist, and hand the
 * upload to WorkManager.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (t: Throwable) {
            return
        } ?: return
        if (messages.isEmpty()) return

        // A long SMS arrives split across several PDUs. They share a sender
        // and must be stitched back together in order, or the parser sees
        // fragments and the amount lands in one part with the merchant in
        // another.
        val sender = messages.first().displayOriginatingAddress ?: return
        val body = messages.joinToString(separator = "") { it.displayMessageBody ?: "" }
        val receivedAt = messages.first().timestampMillis.takeIf { it > 0 }
            ?: System.currentTimeMillis()

        if (body.isBlank()) return

        // Before the user has connected there is no token and no consent —
        // holding their personal SMS in a queue on the off-chance they sign
        // up later is a liability, not a feature.
        if (!CaptureStore.isConfigured(context)) return

        CaptureStore.enqueue(context, sender, body, receivedAt)
        UploadWorker.schedule(context)
    }
}
