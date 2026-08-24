package expo.modules.batwacapture

import android.app.Notification
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Second capture path, running alongside SmsReceiver — reading the
 * notification the user's SMS app posts is not covered by Google Play's
 * restricted SMS/Call Log policy, which is what keeps a store build viable
 * even where RECEIVE_SMS is refused.
 *
 * Deliberately narrow, for two reasons the first draft got wrong:
 *
 *  1. SCOPE. Capturing every app's notifications uploads WhatsApp chats and
 *     email previews to the server, floods the queue with media-player
 *     updates until real bank SMS are evicted, and fills the web inbox with
 *     junk. Only the DEFAULT SMS APP's notifications are captured — that is
 *     the one package whose notifications are SMS.
 *
 *  2. DUPLICATION. The notification copy differs from the broadcast in title
 *     and postTime, so it slips every minute-bucketed fingerprint. This used
 *     to be handled by standing the listener down whenever RECEIVE_SMS was
 *     granted, which threw away its real value: the broadcast is not
 *     dependable, because OEM battery managers kill background receivers and
 *     a bank SMS that never arrives leaves a hole nothing else fills.
 *
 *     Both paths now run, and the duplicate is resolved server-side where the
 *     whole message is visible: an already-parsed message with the same body
 *     inside the match window is the same event, whatever label each path put
 *     on the sender. SmsReceiver still gives the better data when it fires —
 *     real originating address and SMSC timestamp — and it wins simply by
 *     usually arriving first.
 */
private val MONEY = Regex(
    """(?:PKR|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:PKR|Rs\.?)""",
    RegexOption.IGNORE_CASE,
)

class BatwaNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!CaptureStore.isConfigured(applicationContext)) return

        // Both paths now run together, deliberately.
        //
        // This used to bail out whenever RECEIVE_SMS was granted, because two
        // capture paths for one message meant two transactions. That is no
        // longer true: the server matches an already-parsed message by body
        // alone, so the same text arriving twice under different sender labels
        // collapses into one row. Running both matters because the broadcast is
        // not dependable — OEM battery managers kill background receivers, and
        // a missed bank SMS is a hole in the ledger that nothing else fills.
        // Belt and braces, with the duplicate handled where it can be handled
        // properly.
        val packageName = sbn.packageName ?: return

        // Two kinds of app may be read, and nothing else. Chats, email and
        // media are private noise that must never leave the device.
        //
        //  - the default SMS app, always: its notifications ARE the bank SMS
        //  - any app the user has explicitly approved, for wallets like
        //    SadaPay and JazzCash that push from their own app and send no
        //    email at all, so a notification is the only signal there is
        val defaultSmsPackage = try {
            Telephony.Sms.getDefaultSmsPackage(applicationContext)
        } catch (t: Throwable) {
            null
        }
        val isSmsApp = defaultSmsPackage != null && packageName == defaultSmsPackage
        val isApproved = CaptureStore.isAllowedPackage(applicationContext, packageName)

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

        // An app the user has not approved gets remembered, never uploaded.
        //
        // Guessing wallet package names in a shipped list fails silently when
        // one is wrong, and enumerating installed apps needs QUERY_ALL_PACKAGES
        // — itself restricted on Play. So the app is noticed only when it
        // actually posts something transaction-shaped, and Settings asks. Only
        // the package name and the app's own label are stored; the text that
        // triggered it is dropped here and never persisted or sent.
        if (!isSmsApp && !isApproved) {
            if (looksTransactional(body)) {
                CaptureStore.recordCandidate(
                    applicationContext,
                    packageName,
                    appLabel(packageName),
                )
            }
            return
        }

        val postedAt = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()

        CaptureStore.enqueue(applicationContext, sender, body, postedAt)
        UploadWorker.schedule(applicationContext)
    }

    /**
     * Does this read like a money alert?
     *
     * Only used to decide whether an unapproved app is worth ASKING about, so
     * it is deliberately loose — a false positive costs one line in Settings
     * that the user ignores, while a false negative means their wallet is
     * never offered at all. Requires a currency marker next to a number, which
     * a chat message or a delivery update will not have.
     */
    private fun looksTransactional(body: String): Boolean =
        MONEY.containsMatchIn(body)

    /** The app's own name, so Settings can name it rather than show a package. */
    private fun appLabel(packageName: String): String = try {
        val pm = applicationContext.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (t: Throwable) {
        packageName
    }

    override fun onListenerConnected() {
        // Anything captured while offline can go out now.
        UploadWorker.schedule(applicationContext)
    }
}
