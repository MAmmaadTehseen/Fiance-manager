package expo.modules.batwacapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Fallback capture path, and the one that stays viable on Google Play:
 * BIND_NOTIFICATION_LISTENER_SERVICE is not covered by the restricted
 * SMS/Call Log policy that makes READ_SMS hard to ship there.
 *
 * It also catches banks that push through their own app rather than by text,
 * which SMS capture cannot see at all.
 *
 * Enabled only when the user grants notification access; if they have granted
 * SMS instead, both paths may see the same message and CaptureStore
 * deduplicates.
 */
class BatwaNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!CaptureStore.isConfigured(applicationContext)) return

        val packageName = sbn.packageName ?: return
        // Our own notifications, and the launcher's, are never bank alerts.
        if (packageName == applicationContext.packageName) return

        val extras = sbn.notification?.extras ?: return

        // EXTRA_BIG_TEXT is the expanded body. Falling back to EXTRA_TEXT
        // would silently truncate long bank messages at the collapsed length,
        // cutting off exactly the balance and reference at the end.
        val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString()
            ?.trim()
            .orEmpty()
        if (body.isBlank()) return

        // The title of an SMS notification is the sender; for a bank's own app
        // it is usually the app or account name. Either is a usable sender id,
        // and the server's templates match on it.
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
