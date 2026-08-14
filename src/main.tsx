import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { TVFocusProvider } from "@/lib/tv-focus";
import { formFactor, platformOS, setNativePlatform, type PlatformOS } from "@/lib/platform";
import "@/index.css";

// One entry, one window.
//
// This file used to decide which of four applications to mount by reading the
// Tauri window label: the main app, a picture-in-picture window, a transparent
// modal overlay window and an HDR overlay window. All three extras were desktop
// windows the OS put on top of the main one, and Android has no such thing —
// there is exactly one WebView, so the question no longer exists.

async function boot() {
  // Ask the native side which host this is before anything renders. The answer
  // only distinguishes the Android app from the browser development rig now
  // that there is a single form factor, but it still has to arrive before the
  // first paint: `platformOS()` memoises, and a capability read against the
  // wrong host would stick for the life of the process.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const info = await import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke<{ os: string }>("platform_info"),
      );
      setNativePlatform(info.os as PlatformOS);
    } catch {
      // Bridge unreachable; platform.ts falls back to looking for it itself.
    }
  }

  const root = document.documentElement;
  root.dataset.os = platformOS();
  // Layout and hit-target sizing key off these. Both are constant — the app
  // targets one device — but the CSS reads them as hooks, so they are stamped
  // rather than assumed.
  root.dataset.formFactor = formFactor();
  root.dataset.input = "dpad";

  if (import.meta.env.DEV) {
    void import("./lib/streams/__fixtures__/verify").then((m) => m.logVerificationReport());
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <TVFocusProvider>
        <App />
      </TVFocusProvider>
    </StrictMode>,
  );

  requestAnimationFrame(() => {
    const bootEl = document.getElementById("harbor-boot");
    if (!bootEl) return;
    bootEl.classList.add("gone");
    setTimeout(() => bootEl.remove(), 260);
  });
}

void boot();
