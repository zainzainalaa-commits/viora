import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { TVFocusProvider } from "@/lib/tv-focus";
import {
  formFactor,
  isDpadPrimary,
  isTouchPrimary,
  platformOS,
  setNativePlatform,
  type PlatformOS,
} from "@/lib/platform";
import { syncFormFactor } from "@/lib/use-form-factor";
import "@/index.css";

// One entry, one window.
//
// This file used to decide which of four applications to mount by reading the
// Tauri window label: the main app, a picture-in-picture window, a transparent
// modal overlay window and an HDR overlay window. All three extras were desktop
// windows the OS put on top of the main one, and Android has no such thing —
// there is exactly one WebView, so the question no longer exists.

async function boot() {
  // The native side knows the truth about the form factor where the web does
  // not: a TV box that reports a mouse and a plain Android UA still sits in
  // UI_MODE_TYPE_TELEVISION. Ask before anything renders, and let platform.ts
  // fall back to its heuristics if the bridge is not there yet.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const info = await import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke<{ os: string; tv?: boolean | null }>("platform_info"),
      );
      setNativePlatform(info.os as PlatformOS, info.tv ?? undefined);
      // The store's snapshot was taken at module load, before the bridge
      // answered; bring it in line with the native verdict so `isPhone()`
      // stops holding a TV at "phone" and layout switches to a side rail.
      syncFormFactor();
    } catch {
      // Bridge unreachable; the UA and pointer fallbacks in platform.ts cover it.
    }
  }

  const root = document.documentElement;
  root.dataset.os = platformOS();
  // Layout and hit-target sizing key off these; a TV is a large screen driven
  // by a D-pad, which is neither the desktop nor the touch case.
  root.dataset.formFactor = formFactor();
  root.dataset.input = isDpadPrimary() ? "dpad" : isTouchPrimary() ? "touch" : "pointer";
  // Rotation and foldables change the form factor; useFormFactor owns keeping
  // both this attribute and React's view of it up to date after boot.

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