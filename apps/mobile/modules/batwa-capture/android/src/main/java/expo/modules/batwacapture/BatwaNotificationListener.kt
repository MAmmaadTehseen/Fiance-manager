package expo.modules.batwacapture

import android.Manifest
import android.app.Notification
import android.content.pm.PackageManager
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Fallback capture path for when SMS permission is refused — reading the
 * notification the user's SMS app posts is not covered by Google Play's
 * restricted SMS/Call Log policy, which is what keeps a store build viable.
 *
 * Deliberately narrow, for two reasons the first draft got wrong:
 *
 *  1. SCOPE. Capturing every app's notifications uploads WhatsApp chats and
 *     email previews to the server, floods the queue with media-player
 *     updates until real bank SMS are evicted, and fills the web inbox with
 *     junk. Only the DEFAULT SMS APP's notifications are captured — that is
 *     the one package whose notifications are SMS.
 *
 *  2. DUPLICATION. When RECEIVE_SMS is granted, SmsReceiver already owns
 *     this path with better data (real originating address, SMSC timestamp).
 *     The notification copy differs in title and postTime, so it slips every
 *     minute-bucketed dedupe layer and double-books the transaction. So when
 *     the receiver can run, this listener stands down entirely.
 */
class BatwaNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!CaptureStore.isConfigured(applicationContext)) return

        // SmsReceiver owns SMS whenever it is allowed to; two capture paths
        // for one message means two transactions.
        val smsGranted = applicationContext.checkSelfPermission(
            Manifest.permission.RECEIVE_SMS,
        ) == PackageManager.PERMISSION_GRANTED
        if (smsGranted) return

        val packageName = sbn.packageName ?: return

        // Only the default SMS app. Everything else — chats, email, media —
        // is private noise that must never leave the device.
        val defaultSmsPackage = try {
            Telephony.Sms.getDefaultSmsPackage(applicationContext)
        } catch (t: Throwable) {
            null
        }
        if (defaultSmsPackage == null || packageName != defaultSmsPackage) return

        val notification = sbn.notification ?: return

        // Ongoing notifications (progress, media) repost constantly, and a
        // group summary duplicates the children it summarises.
        if (sbn.isOngoing) return
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = notification.extras ?: return

        // EXTRA_BIG_TEXT is the expanded body. Falling back to EXTRA_TEXT
        // would silently truncate long bank messages at the collapsed length,
        // cutting off exactly the balance and reference at the end.
        val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString()
            ?.trim()
            .orEmpty()
        if (body.isBlank()) return

        // The title of an SMS notification is the sender.
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
        val sender = if (!title.isNullOrBlank()) title else packageName

        val postedAt = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()

        CaptureStore.enqueue(applicationContext, sender, body, postedAt)
        UploadWorker.schedule(applicationContext)
    }

    override fun onListenerConnected() {
        // Anything captured while offline can go out now.
        UploadWorker.schedule(applicationContext)
    }
}
