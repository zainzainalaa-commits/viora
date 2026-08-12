package app.viora

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.webkit.JavascriptInterface
import dev.jdtech.mpv.MPVLib
import org.json.JSONArray
import org.json.JSONObject

/**
 * The second engine: libmpv, with ffmpeg, libass and libplacebo inside it.
 *
 * ExoPlayer asks the television what it can decode and plays that. mpv brings
 * its own decoders, so it plays the files the television refuses — DTS and
 * TrueHD on a box whose firmware never licensed them, containers nothing else
 * will open — and scales the picture with libplacebo on the way out. It costs
 * about thirty megabytes and more power, which is exactly why it is a choice
 * rather than the default.
 *
 * The verbs below are deliberately the same as {@link VioraPlayer}'s, down to
 * the JSON the page receives, so one bridge in the web layer drives either
 * engine without knowing which one answered.
 *
 * Two things shape the implementation. Property reads are safe from any thread
 * and cheap, so state is polled on the main thread rather than assembled from
 * mpv's event callbacks — the same design as the ExoPlayer side, and it avoids
 * an entire class of ordering bug. And mpv draws nothing but the picture:
 * `sub-visibility` is off and the page renders subtitles from `sub-text`, which
 * is what the desktop build has always done when mpv is embedded, so the
 * viewer's subtitle size and colour keep working.
 */
class VioraMpv(
  private val activity: Activity,
  private val stage: VideoStage,
) {
  private val main = Handler(Looper.getMainLooper())

  private var mpv: MPVLib? = null

  private companion object {
    /** How long mpv gets to open a stream before an idle engine reads as failure. */
    const val OPEN_GRACE_MS = 2_500L
  }

  private var surfaceAttached = false
  private var pendingUrl: String? = null

  /** Answered once: whether libmpv shipped for this device. See `available`. */
  @Volatile
  private var installed: Boolean? = null

  private var lastError: String? = null
  private var lastErrorKind: String? = null

  /** When the current file was handed to mpv; 0 means nothing was asked for. */
  private var loadedAt = 0L

  /** Track lists are re-read only when their count changes; see `readTracks`. */
  private var trackCount = -1
  private var audioTracks = JSONArray()
  private var subtitleTracks = JSONArray()

  @Volatile
  private var snapshot: String = "{\"status\":\"idle\"}"

  private var ticking = false

  private val tick = object : Runnable {
    override fun run() {
      refresh()
      if (ticking) main.postDelayed(this, 200)
    }
  }

  init {
    stage.onSurface = { surface, w, h -> onSurface(surface, w, h) }
  }

  // ---------------------------------------------------------------- lifecycle

  private fun ensureMpv(): MPVLib {
    mpv?.let { return it }
    stage.ensure()
    // Null here means mpv could not be created at all; `load` turns the throw
    // into an error the page can show rather than a crash.
    val lib = MPVLib.create(activity) ?: throw IllegalStateException("mpv_create failed")

    // Output. gpu-next is the libplacebo renderer; the Android GL context and
    // ES profile have to be named explicitly because there is no windowing
    // system here for mpv to guess from.
    lib.setOptionString("vo", "gpu-next")
    lib.setOptionString("gpu-context", "android")
    lib.setOptionString("gpu-api", "opengl")
    lib.setOptionString("opengl-es", "yes")
    lib.setOptionString("ao", "audiotrack")

    // Decoding: the device's hardware where it exists, mpv's own decoders where
    // it does not. That fallback is the entire reason this engine is here, so
    // it must not be a hard requirement in either direction.
    lib.setOptionString("hwdec", "auto-safe")
    lib.setOptionString("hwdec-codecs", "h264,hevc,vp8,vp9,av1,mpeg4,mpeg2video")

    // No user config, no state written anywhere: this is a bundled engine, not
    // an mpv installation the viewer is expected to own.
    lib.setOptionString("config", "no")
    lib.setOptionString("save-position-on-quit", "no")
    lib.setOptionString("osc", "no")
    lib.setOptionString("osd-level", "0")
    lib.setOptionString("input-default-bindings", "no")

    // Stay alive at the end of a file and between files, so the page sees
    // "ended" and a paused last frame instead of the engine shutting down.
    lib.setOptionString("idle", "yes")
    lib.setOptionString("keep-open", "always")
    lib.setOptionString("force-window", "no")

    // The page draws subtitles, in the viewer's chosen size and colour.
    lib.setOptionString("sub-visibility", "no")
    lib.setOptionString("sub-auto", "no")

    // Streaming over HTTP: a cache large enough to seek inside, and a user
    // agent, because some hosts answer differently without one.
    lib.setOptionString("cache", "yes")
    lib.setOptionString("demuxer-max-bytes", "64MiB")
    lib.setOptionString("demuxer-max-back-bytes", "32MiB")
    lib.setOptionString("user-agent", "Viora/1.0 (Android TV)")
    lib.setOptionString("tls-verify", "yes")
    lib.setOptionString("tls-ca-file", "/system/etc/security/cacerts")

    // mpv reports a failed video output or an unreadable stream in its log and
    // nowhere else. Without this the symptom reaching the page would be a black
    // screen with a healthy-looking snapshot, which is the worst kind of bug to
    // be handed second-hand.
    // Kept as evidence, never as a verdict.
    //
    // mpv logs at error level for things it then recovers from — a short HTTP
    // read, a frame it had to drop — and an early version of this turned the
    // first such line into a full error screen over a film that was playing
    // perfectly well. Whether playback actually failed is decided in `refresh`
    // from mpv's own state; this only supplies the wording when it did.
    lib.addLogObserver(object : MPVLib.LogObserver {
      override fun logMessage(prefix: String, level: Int, text: String) {
        if (level > MPVLib.MpvLogLevel.MPV_LOG_LEVEL_ERROR) return
        lastError = "$prefix: ${text.trim()}"
        lastErrorKind = when {
          prefix == "vo" || prefix == "gpu" -> "decode"
          text.contains("Failed to open") || text.contains("Failed to recognize") -> "source"
          text.contains("HTTP") || text.contains("Connection") || text.contains("network") -> "network"
          text.contains("codec") || text.contains("decoder") -> "codec"
          else -> "unknown"
        }
      }
    })
    lib.setOptionString("msg-level", "all=error")

    lib.init()
    mpv = lib
    stage.surface?.holder?.surface?.let { s ->
      if (s.isValid) attach(s, stage.surface!!.width, stage.surface!!.height)
    }
    return lib
  }

  private fun onSurface(surface: Surface?, w: Int, h: Int) {
    val lib = mpv ?: return
    if (surface == null) {
      if (surfaceAttached) {
        lib.detachSurface()
        surfaceAttached = false
      }
      return
    }
    attach(surface, w, h)
  }

  private fun attach(surface: Surface, w: Int, h: Int) {
    val lib = mpv ?: return
    if (!surfaceAttached) {
      lib.attachSurface(surface)
      lib.setPropertyString("force-window", "yes")
      surfaceAttached = true
    }
    // mpv has to be told the size in pixels; without it the first frame is drawn
    // into a zero-sized viewport and the screen stays black.
    if (w > 0 && h > 0) lib.setPropertyString("android-surface-size", "${w}x$h")
    pendingUrl?.let {
      pendingUrl = null
      lib.command(arrayOf("loadfile", it))
    }
  }

  fun onActivityStopped() {
    main.post { mpv?.setPropertyBoolean("pause", true) }
  }

  fun destroy() {
    main.post { teardown() }
  }

  private fun teardown() {
    ticking = false
    main.removeCallbacks(tick)
    val lib = mpv
    mpv = null
    if (lib != null) {
      try {
        if (surfaceAttached) lib.detachSurface()
        lib.destroy()
      } catch (e: Throwable) {
        // Nothing useful to do: the engine is going away either way.
      }
    }
    surfaceAttached = false
    pendingUrl = null
    loadedAt = 0L
    trackCount = -1
    audioTracks = JSONArray()
    subtitleTracks = JSONArray()
    lastError = null
    lastErrorKind = null
    stage.hide()
    snapshot = "{\"status\":\"idle\"}"
  }

  // ----------------------------------------------------------------- snapshot

  private fun str(name: String): String = try {
    mpv?.getPropertyString(name) ?: ""
  } catch (e: Throwable) {
    ""
  }

  private fun num(name: String): Double = try {
    mpv?.getPropertyDouble(name) ?: 0.0
  } catch (e: Throwable) {
    0.0
  }

  private fun flag(name: String): Boolean = try {
    mpv?.getPropertyBoolean(name) ?: false
  } catch (e: Throwable) {
    false
  }

  private fun int(name: String): Int = try {
    mpv?.getPropertyInt(name) ?: 0
  } catch (e: Throwable) {
    0
  }

  /**
   * Rebuilds the track lists, but only when the count moves.
   *
   * mpv exposes a track list as one property per field, so a full read is a few
   * hundred calls across the bridge. At five times a second that would cost more
   * than the decoding does; the count changing is what a new file looks like.
   */
  private fun readTracks() {
    val count = int("track-list/count")
    if (count == trackCount) return
    trackCount = count
    val audio = JSONArray()
    val subs = JSONArray()
    for (i in 0 until count) {
      val type = str("track-list/$i/type")
      if (type != "audio" && type != "sub") continue
      val id = str("track-list/$i/id")
      val title = str("track-list/$i/title")
      val lang = str("track-list/$i/lang")
      val entry = JSONObject().apply {
        put("id", id)
        put("lang", lang)
        put("label", title)
        put("codec", str("track-list/$i/codec"))
        put("channelCount", int("track-list/$i/demux-channel-count"))
        put("selected", flag("track-list/$i/selected"))
        put("supported", true)
        put("forced", flag("track-list/$i/forced"))
        put("default", flag("track-list/$i/default"))
      }
      if (type == "audio") audio.put(entry) else subs.put(entry)
    }
    audioTracks = audio
    subtitleTracks = subs
  }

  private fun refresh() {
    val lib = mpv
    if (lib == null) {
      snapshot = "{\"status\":\"idle\"}"
      return
    }
    readTracks()
    val idle = flag("idle-active")
    val eof = flag("eof-reached")
    val paused = flag("pause")
    val buffering = flag("paused-for-cache")
    val duration = num("duration")
    val position = num("time-pos")

    // What "failed" means here: the page asked for a file, mpv had time to open
    // it, and mpv is sitting with nothing loaded. That is the only state a
    // viewer should ever be shown an error for. The grace period matters —
    // `idle-active` is still true for a moment after `loadfile`, and reporting
    // on that would fail every stream in the instant before it started.
    val settled = loadedAt > 0 && android.os.SystemClock.uptimeMillis() - loadedAt > OPEN_GRACE_MS
    val failed = loadedAt > 0 && idle && settled

    val status = when {
      loadedAt == 0L -> "idle"
      failed -> "error"
      eof -> "ended"
      buffering -> "loading"
      duration <= 0.0 -> "loading"
      paused -> "paused"
      else -> "playing"
    }

    val json = JSONObject()
    json.put("status", status)
    json.put("positionSec", position)
    json.put("durationSec", duration)
    json.put("bufferedSec", num("demuxer-cache-duration"))
    json.put("buffering", buffering)
    // mpv's volume is a percentage and can exceed 100; the page works in 0..1.
    json.put("volume", num("volume") / 100.0)
    json.put("muted", flag("mute"))
    json.put("rate", num("speed"))
    json.put("videoWidth", int("dwidth"))
    json.put("videoHeight", int("dheight"))
    json.put("subDelaySec", num("sub-delay"))
    json.put("audioDelaySec", num("audio-delay"))
    json.put("subText", str("sub-text"))
    json.put("subStartSec", num("sub-start"))
    json.put("hdrGamma", str("video-params/gamma"))
    if (failed) {
      json.put("errorMessage", lastError ?: "mpv could not open this stream.")
      json.put("errorCode", lastErrorKind ?: "source")
    }
    json.put("audioTracks", audioTracks)
    json.put("subtitleTracks", subtitleTracks)
    snapshot = json.toString()
  }

  // ------------------------------------------------------------------ the API

  /**
   * Whether this build actually carries libmpv for this device's architecture.
   *
   * Checked by looking for the file rather than loading it: the page asks this
   * question every time the player mounts, and answering it by mapping thirty
   * megabytes of shared library would be a real cost paid by viewers who chose
   * the other engine.
   */
  @JavascriptInterface
  fun available(): Boolean {
    installed?.let { return it }
    // The library itself declares API 26. The app supports 24, so the older
    // televisions keep working on ExoPlayer and are simply never offered this.
    if (android.os.Build.VERSION.SDK_INT < 26) {
      installed = false
      return false
    }
    val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: ""
    val answer = try {
      // Two places, because it depends on how the APK was packaged: older
      // builds unpack native libraries to disk, current ones map them straight
      // out of the APK and leave that directory empty. Looking only at the
      // directory is what made this report "no mpv" on a device that had it.
      java.io.File(activity.applicationInfo.nativeLibraryDir, "libmpv.so").exists() ||
        java.util.zip.ZipFile(activity.applicationInfo.sourceDir).use {
          it.getEntry("lib/$abi/libmpv.so") != null
        }
    } catch (e: Throwable) {
      false
    }
    installed = answer
    return answer
  }

  @JavascriptInterface
  fun load(spec: String): Boolean {
    val json = try {
      JSONObject(spec)
    } catch (e: Throwable) {
      return false
    }
    val url = json.optString("url")
    if (url.isEmpty()) return false
    val startSec = json.optDouble("startAtSec", 0.0)
    val headerLines = ArrayList<String>()
    json.optJSONObject("headers")?.let { h ->
      val keys = h.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        headerLines.add("$k: ${h.optString(k)}")
      }
    }
    main.post {
      lastError = null
      lastErrorKind = null
      trackCount = -1
      loadedAt = android.os.SystemClock.uptimeMillis()
      val lib = try {
        ensureMpv()
      } catch (e: Throwable) {
        lastError = "mpv failed to start: ${e.message ?: e.javaClass.simpleName}"
        lastErrorKind = "unknown"
        refresh()
        return@post
      }
      // Both are sticky, so they are always written — an empty value clears what
      // the previous stream needed rather than leaking it onward.
      lib.setPropertyString("http-header-fields", headerLines.joinToString(","))
      lib.setPropertyString("start", if (startSec > 0) "+$startSec" else "none")
      // Paused until the page says otherwise: it may still have to ask whether
      // to resume or start over, and a second of audio under that question is a
      // second too many.
      lib.setPropertyBoolean("pause", true)
      stage.show()
      if (surfaceAttached) lib.command(arrayOf("loadfile", url)) else pendingUrl = url
      if (!ticking) {
        ticking = true
        main.post(tick)
      }
      refresh()
    }
    return true
  }

  @JavascriptInterface
  fun play() {
    main.post {
      mpv?.setPropertyBoolean("pause", false)
      refresh()
    }
  }

  @JavascriptInterface
  fun pause() {
    main.post {
      mpv?.setPropertyBoolean("pause", true)
      refresh()
    }
  }

  @JavascriptInterface
  fun seek(sec: Double) {
    main.post {
      mpv?.command(arrayOf("seek", sec.coerceAtLeast(0.0).toString(), "absolute"))
      refresh()
    }
  }

  @JavascriptInterface
  fun setVolume(v: Double) {
    main.post {
      mpv?.setPropertyDouble("volume", (v * 100.0).coerceIn(0.0, 600.0))
      refresh()
    }
  }

  @JavascriptInterface
  fun setMuted(m: Boolean) {
    main.post {
      mpv?.setPropertyBoolean("mute", m)
      refresh()
    }
  }

  @JavascriptInterface
  fun setRate(r: Double) {
    main.post {
      mpv?.setPropertyDouble("speed", r.coerceIn(0.01, 100.0))
      refresh()
    }
  }

  @JavascriptInterface
  fun setAudioTrack(id: String) {
    main.post {
      mpv?.setPropertyString("aid", if (id.isEmpty()) "no" else id)
      trackCount = -1
      refresh()
    }
  }

  /** The empty string means off; a binder call cannot carry null. */
  @JavascriptInterface
  fun setSubtitleTrack(id: String) {
    main.post {
      mpv?.setPropertyString("sid", if (id.isEmpty()) "no" else id)
      trackCount = -1
      refresh()
    }
  }

  /**
   * Asks the engine to stop drawing subtitles itself. It never starts.
   *
   * `sub-visibility` is off from the moment mpv is created, because the page
   * renders subtitles in the viewer's own font and size. The call is re-asserted
   * rather than obeyed: its argument means "you draw them", and honouring that
   * would put mpv's own text on screen alongside the page's.
   */
  @JavascriptInterface
  fun setSubVisible(on: Boolean) {
    main.post { mpv?.setPropertyBoolean("sub-visibility", false) }
  }

  @JavascriptInterface
  fun setSubDelay(sec: Double) {
    main.post {
      mpv?.setPropertyDouble("sub-delay", sec)
      refresh()
    }
  }

  /** Unlike ExoPlayer, mpv can shift the audio clock in either direction. */
  @JavascriptInterface
  fun setAudioDelay(sec: Double) {
    main.post {
      mpv?.setPropertyDouble("audio-delay", sec)
      refresh()
    }
  }

  /**
   * Geometry is mpv's own business here.
   *
   * The surface stays the size of the screen and mpv scales into it, which is
   * the opposite of the ExoPlayer side — there the surface rectangle *is* the
   * aspect ratio. Same three arguments from the page either way.
   */
  @JavascriptInterface
  fun setGeometry(mode: String, aspect: Double, zoom: Double) {
    main.post {
      val lib = mpv ?: return@post
      lib.setPropertyBoolean("keepaspect", mode != "stretch")
      lib.setPropertyDouble("panscan", if (mode == "fill") 1.0 else 0.0)
      lib.setPropertyDouble("video-zoom", zoom)
      lib.setPropertyString("video-aspect-override", if (aspect > 0) aspect.toString() else "-1")
    }
  }

  /** libplacebo shader chain, for Anime4K and anything like it. */
  @JavascriptInterface
  fun setShaders(paths: String) {
    main.post { mpv?.setPropertyString("glsl-shaders", paths) }
  }

  @JavascriptInterface
  fun setAudioNormalize(on: Boolean) {
    main.post {
      mpv?.command(
        if (on) arrayOf("af", "set", "dynaudnorm=g=5:f=250:r=0.9:p=0.5")
        else arrayOf("af", "set", ""),
      )
    }
  }

  @JavascriptInterface
  fun state(): String = snapshot

  @JavascriptInterface
  fun release() {
    main.post { teardown() }
  }
}
