package app.viora

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
  override fun onWebViewCreate(webView: WebView) {
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
