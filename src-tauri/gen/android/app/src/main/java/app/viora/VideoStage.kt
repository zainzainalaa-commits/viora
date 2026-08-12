package app.viora

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout

/**
 * The rectangle the video is drawn on, and everything that has to be true for
 * the page to be seen on top of it.
 *
 * Both native engines want the same thing: a surface *behind* the WebView, a
 * WebView that stops painting its own background while playback lasts, and a
 * screen that does not go to sleep. Only the geometry differs — ExoPlayer
 * stretches its frame to whatever rectangle the surface occupies, so the
 * rectangle is the control; mpv scales internally and wants the whole screen.
 * That is the one flag this class takes.
 */
class VideoStage(
  private val activity: Activity,
  private val webView: () -> WebView?,
  /** True for ExoPlayer: aspect ratio is expressed by sizing the surface. */
  private val sizesSurface: Boolean,
) {
  private var container: FrameLayout? = null
  private var surfaceView: SurfaceView? = null

  private var fillMode = "fit"
  private var aspectOverride = -1.0
  private var zoomLog2 = 0.0
  private var videoAspect = 0.0

  /** Told when the drawing surface appears, resizes, or goes away. */
  var onSurface: ((Surface?, Int, Int) -> Unit)? = null

  val surface: SurfaceView?
    get() = surfaceView

  /**
   * Builds the views once, underneath everything else.
   *
   * `addView(frame, 0)` is what puts the video under the WebView rather than
   * over it — a surface on top of the interface is a black rectangle where the
   * controls should be, which is the usual way this goes wrong.
   */
  fun ensure() {
    if (surfaceView != null) return
    val root = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
    val frame = FrameLayout(activity)
    frame.setBackgroundColor(Color.BLACK)
    val view = SurfaceView(activity)
    view.holder.addCallback(object : SurfaceHolder.Callback {
      override fun surfaceCreated(holder: SurfaceHolder) {}

      override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        onSurface?.invoke(holder.surface, width, height)
      }

      override fun surfaceDestroyed(holder: SurfaceHolder) {
        onSurface?.invoke(null, 0, 0)
      }
    })
    frame.addView(
      view,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER,
      ),
    )
    frame.visibility = View.GONE
    root.addView(
      frame,
      0,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    container = frame
    surfaceView = view
  }

  fun show() {
    ensure()
    container?.visibility = View.VISIBLE
    applyLayout()
    // The page is drawn on top of the video from here on, so it must stop
    // painting its own background over it.
    webView()?.setBackgroundColor(Color.TRANSPARENT)
    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  fun hide() {
    container?.visibility = View.GONE
    webView()?.setBackgroundColor(Color.BLACK)
    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  fun setVideoAspect(aspect: Double) {
    if (aspect == videoAspect) return
    videoAspect = aspect
    applyLayout()
  }

  /** `mode` is fit, fill or stretch; `aspect` is -1 unless the page forces one. */
  fun setGeometry(mode: String, aspect: Double, zoom: Double) {
    fillMode = mode
    aspectOverride = aspect
    zoomLog2 = zoom
    applyLayout()
  }

  /**
   * Sizes the surface instead of scaling the picture inside it.
   *
   * ExoPlayer's default scaling mode stretches the decoded frame to whatever
   * rectangle the surface occupies — aspect ratio is the *view's* job, not the
   * decoder's. So fit, fill, stretch, zoom and a forced ratio are all one
   * calculation: work out the rectangle, hand it to the layout, and let the
   * frame follow. The parent clips whatever hangs over the edges.
   */
  fun applyLayout() {
    val frame = container ?: return
    val view = surfaceView ?: return
    if (!sizesSurface) return
    val boxW = frame.width
    val boxH = frame.height
    if (boxW <= 0 || boxH <= 0) {
      frame.post { applyLayout() }
      return
    }
    val target = if (aspectOverride > 0) aspectOverride else videoAspect
    val boxAspect = boxW.toDouble() / boxH.toDouble()

    var w = boxW.toDouble()
    var h = boxH.toDouble()
    if (target > 0 && fillMode != "stretch") {
      val cover = fillMode == "fill"
      val wider = boxAspect > target
      if (wider == cover) {
        w = boxW.toDouble()
        h = w / target
      } else {
        h = boxH.toDouble()
        w = h * target
      }
    }
    if (zoomLog2 != 0.0) {
      val factor = Math.pow(2.0, zoomLog2)
      w *= factor
      h *= factor
    }

    val params = view.layoutParams as FrameLayout.LayoutParams
    val nw = Math.max(1, Math.round(w).toInt())
    val nh = Math.max(1, Math.round(h).toInt())
    if (params.width == nw && params.height == nh) return
    params.width = nw
    params.height = nh
    params.gravity = Gravity.CENTER
    view.layoutParams = params
  }
}
