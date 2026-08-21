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
import java.util.concurrent.TimeUnit

/**
 * Drains the pending queue to the ingest endpoint.
 *
 * Scheduled by WorkManager, so it runs when the network comes back rather
 * than only while the app is open, and survives both process death and reboot.
 */
class UploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val token = CaptureStore.token(ctx)
        val endpoint = CaptureStore.endpoint(ctx)

        // Not configured yet: keep the messages, do not retry in a loop. The
        // app enqueues work again as soon as a token is stored.
        if (token.isNullOrBlank() || endpoint.isNullOrBlank()) return@withContext Result.success()

        val pending = CaptureStore.peekAll(ctx)
        if (pending.isEmpty()) return@withContext Result.success()

        var accepted = 0
        for (message in pending) {
            when (send(endpoint, token, message)) {
                SendOutcome.ACCEPTED -> accepted++
                SendOutcome.REJECTED -> {
                    // The server understood us and refused — a revoked token,
                    // or a malformed body. Retrying cannot help, and leaving it
                    // at the head of the queue would block every message behind
                    // it forever, so drop it and move on.
                    accepted++
                }
                SendOutcome.RETRY -> {
                    // Network or server-side failure. Everything from here on
                    // stays queued, in order.
                    if (accepted > 0) CaptureStore.drop(ctx, accepted)
                    return@withContext Result.retry()
                }
            }
        }

        CaptureStore.drop(ctx, accepted)
        CaptureStore.recordSent(ctx, accepted)
        Result.success()
    }

    private enum class SendOutcome { ACCEPTED, REJECTED, RETRY }

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
                append("&received_at=").append(encode(iso8601(message.receivedAt)))
                append("&device=").append(encode("batwa-android"))
            }

            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }

            when (val code = connection.responseCode) {
                in 200..299 -> SendOutcome.ACCEPTED
                // 401 revoked token, 400 unreadable body, 413 too large.
                // All permanent; retrying just blocks the queue.
                401, 400, 413, 403, 422 -> {
                    CaptureStore.recordError(
                        applicationContext,
                        "Server refused a message (HTTP $code). Re-connect this phone in Settings.",
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

    private fun iso8601(millis: Long): String {
        val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return format.format(java.util.Date(millis))
    }

    companion object {
        private const val WORK_NAME = "batwa-upload"

        /**
         * Queues a drain. KEEP rather than REPLACE so a burst of messages does
         * not keep cancelling and restarting the same job — each enqueue
         * already persisted its message, and one run drains all of them.
         */
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
        }

        /** Used by the app's "send now" control, which should not wait. */
        fun scheduleNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
