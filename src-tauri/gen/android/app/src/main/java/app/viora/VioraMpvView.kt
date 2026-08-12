package app.viora

import android.content.Context
import android.util.AttributeSet
import android.view.SurfaceHolder
import `is`.xyz.mpv.BaseMPVView
import `is`.xyz.mpv.Utils
import java.util.Locale

/**
 * mpv's drawing surface, and the options it starts with.
 *
 * `BaseMPVView` is a SurfaceView that already knows when its surface appears and
 * goes away, and attaches and detaches mpv accordingly. That is not a
 * convenience — writing it by hand is how this engine first failed: mpv opened
 * the file, decoded a frame, and died at the last step with "Missing surface
 * pointer", because it had been handed a surface that was destroyed a moment
 * earlier. Everything about that failure looked like a bad stream.
 *
 * The option set below is deliberately close to what other Android TV players
 * ship rather than what looks best on paper, because these are the values that
 * have been run against real televisions.
 */
class VioraMpvView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : BaseMPVView(context, attrs) {

  private var started = false
  private var pendingUrl: String? = null
  private var pendingStartSec = 0.0

  /** Set before `start()`; mpv reads it once, when the engine is created. */
  var hwdec: String = "auto-safe"

  fun start() {
    if (started) return
    // Unpacks the library's own assets, of which one matters enormously:
    // cacert.pem. Android ships no PEM bundle at any path ffmpeg can read, so
    // without this every HTTPS stream fails to open with nothing more useful
    // than "Failed to open <url>".
    Utils.copyAssets(context)
    initialize(configDir = context.filesDir.path, cacheDir = context.cacheDir.path)
    started = true
    // The surface may already be alive from a previous session, in which case
    // the callback that attaches it fired while mpv did not yet exist and will
    // not fire again. Playback then decodes into nothing: audio plays, the
    // screen stays black, and mpv's log says "Missing surface pointer".
    attachExistingSurface()
  }

  val isStarted: Boolean
    get() = started

  fun stop() {
    if (!started) return
    started = false
    pendingUrl = null
    runCatching { destroy() }
  }

  private fun attachExistingSurface() {
    if (!started) return
    val surface = holder.surface ?: return
    if (!surface.isValid) return
    runCatching { surfaceCreated(holder) }
  }

  /**
   * Loads a file as soon as there is somewhere to draw it.
   *
   * The surface is created asynchronously after the stage becomes visible, so a
   * load arriving first has to wait rather than be given to mpv early.
   */
  fun load(url: String, startSec: Double) {
    if (!started) return
    attachExistingSurface()
    if (holder.surface?.isValid == true) {
      issue(url, startSec)
    } else {
      pendingUrl = url
      pendingStartSec = startSec
    }
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    super.surfaceCreated(holder)
    val url = pendingUrl ?: return
    pendingUrl = null
    issue(url, pendingStartSec)
  }

  /**
   * `loadfile` is `<url> [<flags> [<index> [<options>]]]`, so a per-file option
   * list belongs in the fifth argument. Put it where `<index>` is expected and
   * mpv rejects the whole command and stays idle — which looks exactly like a
   * stream that would not open.
   */
  private fun issue(url: String, startSec: Double) {
    if (startSec > 0) {
      mpv.command("loadfile", url, "replace", "-1", String.format(Locale.US, "start=%.3f", startSec))
    } else {
      mpv.command("loadfile", url, "replace")
    }
  }

  override fun initOptions() {
    mpv.setOptionString("profile", "fast")
    setVo("gpu")
    mpv.setOptionString("gpu-context", "android")
    mpv.setOptionString("opengl-es", "yes")

    mpv.setOptionString("hwdec", hwdec)
    mpv.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")
    mpv.setOptionString("ao", "audiotrack,opensles")
    mpv.setOptionString("audio-set-media-role", "yes")

    // The page draws subtitles, in the viewer's own font, size and colour, from
    // the `sub-text` property. mpv must not draw a second copy over them.
    mpv.setOptionString("sub-visibility", "no")
    mpv.setOptionString("sub-auto", "no")

    mpv.setOptionString("user-agent", "Viora/1.0 (Android TV)")
    mpv.setOptionString("tls-verify", "yes")
    mpv.setOptionString("tls-ca-file", "${context.filesDir.path}/cacert.pem")

    // No youtube-dl on Android, and the hook runs for every http URL before
    // mpv opens it directly. Its failure is logged at error level, so it ends
    // up being the message shown for streams that failed for other reasons.
    mpv.setOptionString("ytdl", "no")

    mpv.setOptionString("demuxer-max-bytes", "${64 * 1024 * 1024}")
    mpv.setOptionString("demuxer-max-back-bytes", "${32 * 1024 * 1024}")
    mpv.setOptionString("cache", "yes")

    // Stay on the last frame at the end of a file instead of going idle, so the
    // page can tell "finished" apart from "never opened".
    mpv.setOptionString("keep-open", "always")
    mpv.setOptionString("idle", "yes")

    mpv.setOptionString("softvol", "yes")
    mpv.setOptionString("volume-max", "600")
    mpv.setOptionString("input-default-bindings", "no")
    mpv.setOptionString("osc", "no")
    mpv.setOptionString("osd-level", "0")
  }

  override fun postInitOptions() {
    mpv.setOptionString("save-position-on-quit", "no")
  }

  override fun observeProperties() {
    // Nothing: the state the page needs is polled in VioraMpv.refresh().
  }
}
