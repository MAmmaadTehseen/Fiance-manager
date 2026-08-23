package expo.modules.batwacapture

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Drains the pending queue to the ingest endpoint.
 *
 * Scheduled by WorkManager, so it runs when the network comes back rather
 * than only while the app is open, and survives both process death and reboot.
 *
 * Outcome discipline matters more than anything else here:
 *  - ACCEPTED        server took it -> remove from queue, count as sent.
 *  - REJECTED        server understood and refused THIS message (bad body,
 *                    too large) -> remove so it cannot block the queue, but
 *                    never count it as sent.
 *  - AUTH_FAILED     the credential is dead, not the message. Every message
 *                    would fail identically, so STOP, keep the entire queue,
 *                    and surface the error. Draining the queue into a revoked
 *                    token would permanently destroy real transactions while
 *                    the UI reported success.
 *  - RETRY           network or server trouble -> keep everything from here
 *                    on, back off, try again.
 */
class UploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val token = CaptureStore.token(ctx)
        val endpoint = CaptureStore.endpoint(ctx)

        // Not configured yet: keep the messages, do not spin. The app
        // enqueues work again the moment a token is stored.
        if (token.isNullOrBlank() || endpoint.isNullOrBlank()) return@withContext Result.success()

        val pending = CaptureStore.peekAll(ctx)
        if (pending.isEmpty()) return@withContext Result.success()

        var processed = 0 // rows to drop from the head of the queue
        var sent = 0      // rows the server actually accepted

        for (message in pending) {
            when (send(endpoint, token, message)) {
                SendOutcome.ACCEPTED -> {
                    processed++
                    sent++
                }
                SendOutcome.REJECTED -> {
                    // Dropped but NOT counted as sent, and the recorded error
                    // is left standing so the user can see something was
                    // refused.
                    processed++
                }
                SendOutcome.AUTH_FAILED -> {
                    if (processed > 0) CaptureStore.drop(ctx, processed)
                    if (sent > 0) CaptureStore.recordSent(ctx, sent)
                    CaptureStore.recordError(
                        ctx,
                        "This phone's key was revoked. Re-connect in the app — " +
                            "your messages are kept and will send after that.",
                    )
                    // Not retry(): retrying cannot succeed until the user
                    // reconnects, and configure() schedules a fresh drain.
                    return@withContext Result.success()
                }
                SendOutcome.RETRY -> {
                    if (processed > 0) CaptureStore.drop(ctx, processed)
                    if (sent > 0) CaptureStore.recordSent(ctx, sent)
                    return@withContext Result.retry()
                }
            }
        }

        CaptureStore.drop(ctx, processed)
        if (sent > 0) CaptureStore.recordSent(ctx, sent)
        Result.success()
    }

    private enum class SendOutcome { ACCEPTED, REJECTED, AUTH_FAILED, RETRY }

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun send(endpoint: String, token: String, message: QueuedMessage): SendOutcome {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 20_000
                doOutput = true
                setRequestProperty("X-Ingest-Token", token)
                // Form encoding, not JSON: bank messages carry quotes and line
                // breaks, and the HTTP client escapes those for us. Building
                // JSON by hand around arbitrary message text is how the
                // MacroDroid setup silently lost messages.
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            }

            val payload = buildString {
                append("sender=").append(encode(message.sender))
                append("&body=").append(encode(message.body))
                append("&received_at=").append(encode(isoFormat.format(Date(message.receivedAt))))
                append("&device=").append(encode("batwa-android"))
            }

            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }

            when (val code = connection.responseCode) {
                in 200..299 -> SendOutcome.ACCEPTED
                // The credential is dead, not the message.
                401, 403 -> SendOutcome.AUTH_FAILED
                // This message is malformed or oversized; retrying cannot
                // help, and leaving it at the head blocks everything behind.
                400, 413, 422 -> {
                    CaptureStore.recordError(
                        applicationContext,
                        "The server refused one message (HTTP $code); it was skipped.",
                    )
                    SendOutcome.REJECTED
                }
                else -> {
                    CaptureStore.recordError(applicationContext, "Upload failed (HTTP $code)")
                    SendOutcome.RETRY
                }
            }
        } catch (t: Throwable) {
            CaptureStore.recordError(
                applicationContext,
                t.message ?: "Network unavailable",
            )
            SendOutcome.RETRY
        } finally {
            try {
                connection?.errorStream?.use(::drain)
            } catch (_: Throwable) {
            }
            connection?.disconnect()
        }
    }

    private fun drain(stream: java.io.InputStream) {
        stream.bufferedReader().use(BufferedReader::readText)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    companion object {
        private const val WORK_NAME = "batwa-upload"

        /**
         * One builder for both entry points, differing only in policy. The
         * previous pair of near-identical builders had already drifted: the
         * manual path lost the backoff criteria.
         *
         * KEEP for the automatic path so a burst of messages does not keep
         * cancelling and restarting one job; REPLACE for the user's explicit
         * "send now", which should not wait behind a backed-off retry.
         */
        private fun enqueue(context: Context, policy: ExistingWorkPolicy) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_NAME, policy, request)
        }

        fun schedule(context: Context) = enqueue(context, ExistingWorkPolicy.KEEP)

        fun scheduleNow(context: Context) = enqueue(context, ExistingWorkPolicy.REPLACE)
    }
}
