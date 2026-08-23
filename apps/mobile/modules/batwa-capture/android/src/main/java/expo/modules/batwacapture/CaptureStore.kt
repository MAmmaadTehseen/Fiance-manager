package expo.modules.batwacapture

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

data class QueuedMessage(val sender: String, val body: String, val receivedAt: Long)

/**
 * Config and the pending-message queue.
 *
 * The queue is the reason capture is native at all. A bank SMS arrives
 * whenever it arrives — in a basement, on a plane, mid-reboot — and if the
 * upload is tried once and dropped on failure, that transaction is gone with
 * nothing to tell the user it ever existed. Messages are persisted the instant
 * they are received, and removed only once the server has accepted them.
 *
 * Storage is EncryptedSharedPreferences where the keystore cooperates, with a
 * plain fallback: on some devices AndroidKeyStore throws, and losing capture
 * entirely is worse than keeping a write-scoped token in app-private storage.
 */
object CaptureStore {
    private const val PREFS = "batwa_capture"
    private const val KEY_TOKEN = "ingest_token"
    private const val KEY_TOKEN_HASH = "ingest_token_hash"
    private const val KEY_ENDPOINT = "ingest_endpoint"
    private const val KEY_QUEUE = "pending"
    private const val KEY_SENT = "sent_count"
    private const val KEY_LAST_ERROR = "last_error"
    private const val KEY_LAST_SENT_AT = "last_sent_at"

    /** Stops a misbehaving sender from growing the queue without bound. */
    private const val MAX_QUEUED = 500

    @Volatile
    private var cached: SharedPreferences? = null

    private fun prefs(context: Context): SharedPreferences {
        cached?.let { return it }
        val resolved = try {
            val key = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (t: Throwable) {
            // A DIFFERENT file for the fallback. Writing plaintext keys into
            // the encrypted store's own file split-brains it: once the
            // keystore recovers, the encrypted view cannot see the plaintext
            // entries, and mixing foreign keys in can corrupt the file
            // outright. Separate files mean a fallback window loses
            // encryption, never data.
            context.getSharedPreferences(PREFS + "_plain", Context.MODE_PRIVATE)
        }
        cached = resolved
        return resolved
    }

    // --------------------------------------------------------------- config

    fun setConfig(context: Context, token: String, endpoint: String, tokenHash: String) {
        prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_ENDPOINT, endpoint)
            .putString(KEY_TOKEN_HASH, tokenHash)
            .commit()
    }

    fun tokenHash(context: Context): String? = prefs(context).getString(KEY_TOKEN_HASH, null)

    fun clearConfig(context: Context) {
        prefs(context).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_ENDPOINT)
            .remove(KEY_TOKEN_HASH)
            .commit()
    }

    fun token(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)

    fun endpoint(context: Context): String? = prefs(context).getString(KEY_ENDPOINT, null)

    fun isConfigured(context: Context): Boolean =
        !token(context).isNullOrBlank() && !endpoint(context).isNullOrBlank()

    // ------------------------------------------------------------ telemetry

    fun sentCount(context: Context): Int = prefs(context).getInt(KEY_SENT, 0)

    fun lastSentAt(context: Context): Long = prefs(context).getLong(KEY_LAST_SENT_AT, 0L)

    fun lastError(context: Context): String? = prefs(context).getString(KEY_LAST_ERROR, null)

    fun recordSent(context: Context, count: Int) {
        prefs(context).edit()
            .putInt(KEY_SENT, sentCount(context) + count)
            .putLong(KEY_LAST_SENT_AT, System.currentTimeMillis())
            .remove(KEY_LAST_ERROR)
            .commit()
    }

    fun recordError(context: Context, message: String) {
        prefs(context).edit().putString(KEY_LAST_ERROR, message).commit()
    }

    // ---------------------------------------------------------------- queue

    @Synchronized
    fun enqueue(context: Context, sender: String, body: String, receivedAt: Long) {
        if (sender.isBlank() || body.isBlank()) return

        val queue = readQueue(context)

        // The SMS receiver and the notification listener can both see the same
        // message. Skipping the duplicate here saves a request; the server
        // deduplicates too, so this is the optimisation, not the guarantee.
        val minute = receivedAt / 60_000
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            if (item.optString("sender") == sender &&
                item.optString("body") == body &&
                item.optLong("receivedAt") / 60_000 == minute
            ) {
                return
            }
        }

        // Evict the OLDEST when full. The message most worth keeping is the
        // one that just arrived; silently discarding it while stale entries
        // keep their slots is precisely backwards.
        while (queue.length() >= MAX_QUEUED) {
            queue.remove(0)
        }

        queue.put(
            JSONObject()
                .put("sender", sender)
                .put("body", body)
                .put("receivedAt", receivedAt),
        )
        writeQueue(context, queue)
    }

    @Synchronized
    fun peekAll(context: Context): List<QueuedMessage> {
        val queue = readQueue(context)
        val out = ArrayList<QueuedMessage>(queue.length())
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            out.add(
                QueuedMessage(
                    sender = item.optString("sender"),
                    body = item.optString("body"),
                    receivedAt = item.optLong("receivedAt"),
                ),
            )
        }
        return out
    }

    /** Removes the first [count] messages — the ones the server accepted. */
    @Synchronized
    fun drop(context: Context, count: Int) {
        if (count <= 0) return
        val queue = readQueue(context)
        val remaining = JSONArray()
        for (i in count until queue.length()) {
            queue.optJSONObject(i)?.let { remaining.put(it) }
        }
        writeQueue(context, remaining)
    }

    @Synchronized
    fun pendingCount(context: Context): Int = readQueue(context).length()

    private fun readQueue(context: Context): JSONArray =
        try {
            JSONArray(prefs(context).getString(KEY_QUEUE, "[]") ?: "[]")
        } catch (t: Throwable) {
            JSONArray()
        }

    private fun writeQueue(context: Context, queue: JSONArray) {
        // commit(), not apply(): the receiver's process can be torn down the
        // moment onReceive returns, and an unflushed queue is a lost message.
        prefs(context).edit().putString(KEY_QUEUE, queue.toString()).commit()
    }
}
