# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# The two bridges the page calls into.
#
# R8 has no way to see that anything uses these: the callers are strings in a
# JavaScript bundle. Android's default rules do keep @JavascriptInterface
# members, but this app cannot afford to find out the hard way — the failure is
# silent, and it takes out the clipboard and the whole native player in a
# release build while the debug build stays perfect.
-keepclassmembers class app.viora.VioraPlayer {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class app.viora.VioraMpv {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class app.viora.MainActivity$ClipboardBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile