package app.viora

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  /** Held so a window-focus change can hand the keyboard back to the page. */
  private var contentWebView: WebView? = null

  /**
   * The two native engines, and a drawing surface each.
   *
   * Separate stages rather than one shared surface, because the two engines want
   * opposite things from it: ExoPlayer expresses aspect ratio by the size of the
   * rectangle it draws into, mpv scales into a full-screen one. Only ever one is
   * visible, and neither creates a view until something asks it to play.
   */
  private val exoStage by lazy { VideoStage(this, { contentWebView }, sizesSurface = true) }
  private val mpvStage by lazy {
    VideoStage(this, { contentWebView }, sizesSurface = false) { VioraMpvView(it) }
  }
  private val nativePlayer by lazy { VioraPlayer(this, exoStage) }
  private val nativeMpv by lazy { VioraMpv(this, mpvStage) }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * Playback should not follow the viewer out of the app.
   *
   * The page cannot be relied on for this: a WebView that has been backgrounded
   * gets its timers throttled, so a `visibilitychange` handler may not run until
   * the app is in the foreground again — by which point the audio has been
   * playing over the launcher for as long as it took.
   */
  override fun onStop() {
    super.onStop()
    nativePlayer.onActivityStopped()
    nativeMpv.onActivityStopped()
  }

  override fun onDestroy() {
    nativePlayer.destroy()
    nativeMpv.destroy()
    super.onDestroy()
  }

  /**
   * Gives the WebView Android's keyboard focus, so the first D-pad press is not
   * spent granting it.
   *
   * Measured on the TV emulator: for the whole of startup the page reported
   * `document.hasFocus() === false`, while `visibilityState` was `visible` and
   * `readyState` `complete`. The web layer was entirely healthy — DOM focus was
   * already on a control and the engine's key was stable from +75ms — but the
   * document held no keyboard focus, so Android spent the first DPAD key moving
   * native focus into the WebView rather than delivering it. The page saw no
   * `keydown` at all for that press, `hasFocus` flipped to true immediately
   * after it, and every later press arrived normally.
   *
   * That is why this could not be fixed from JavaScript: nothing in the page
   * ever saw the event, so neither Norigin nor the app's own guards could act on
   * it. It is also why it needs no per-screen code — the handoff happens once,
   * beneath the whole application, and every screen inherits the result.
   *
   * Posted rather than called directly: the view is not attached to the window
   * yet when it is created, and `requestFocus` on a detached view does nothing.
   */
  private fun takeKeyboardFocus(webView: WebView) {
    webView.isFocusable = true
    webView.isFocusableInTouchMode = true
    webView.post { webView.requestFocus() }
  }

  /**
   * The same handoff is needed again whenever the window regains focus —
   * returning from the launcher, a permission dialog, the screensaver —
   * otherwise the first press after coming back is swallowed exactly as it was
   * at startup.
   */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) contentWebView?.let { takeKeyboardFocus(it) }
  }

  /**
   * Routes the remote's Back key into the app before it closes anything.
   *
   * Wry's own callback asks `WebView.canGoBack()`, which reports *browser*
   * history. This app is a single page that never pushes history entries, so the
   * answer is always false and Back quit to the launcher from wherever the user
   * was — one level inside a details page included.
   *
   * The web layer keeps a stack of back handlers and reports whether one of them
   * consumed the press. Only when none did does the press fall through and close
   * the app, which is what Back at the top level should do on a TV.
   *
   * Registered from `onWebViewCreate` on purpose: the dispatcher runs the most
   * recently added callback first, and Wry adds its own inside `setWebView`,
   * immediately before this hook runs.
   */
  /**
   * The system clipboard, which the web layer cannot reach on Android.
   *
   * Measured in this WebView: `navigator.clipboard.readText()` exists, the
   * context is secure, and the permission is `denied` — the page simply cannot
   * read what the viewer copied. That matters on one screen in particular:
   * pasting an add-on's manifest URL, which is far too long to spell out on an
   * on-screen keyboard one letter at a time.
   *
   * Android hands the clipboard to whichever app holds input focus, and this app
   * does whenever the viewer is looking at it, so reading here is allowed where
   * reading from the page is not. Nothing is written or cleared without being
   * asked, and the text goes only to the page that requested it.
   */
  private inner class ClipboardBridge {
    @JavascriptInterface
    fun read(): String {
      val manager = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return ""
      val clip = manager.primaryClip ?: return ""
      if (clip.itemCount == 0) return ""
      return clip.getItemAt(0).coerceToText(this@MainActivity)?.toString() ?: ""
    }

    @JavascriptInterface
    fun write(text: String): Boolean {
      val manager = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return false
      manager.setPrimaryClip(ClipData.newPlainText("viora", text))
      return true
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    contentWebView = webView
    takeKeyboardFocus(webView)
    webView.addJavascriptInterface(ClipboardBridge(), "VioraClipboard")
    webView.addJavascriptInterface(nativePlayer, "VioraPlayer")
    webView.addJavascriptInterface(nativeMpv, "VioraMpv")

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript(
          "(function(){try{return !!(window.__vioraBack&&window.__vioraBack())}catch(e){return false}})()"
        ) { result ->
          if (result != "true") {
            // Nothing in the app wanted it: stand down for a single press so the
            // default behaviour, closing the activity, can run.
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }
}
