import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { TVFocusProvider } from "@/lib/tv-focus";
import { formFactor, isDpadPrimary, isTouchPrimary, platformOS } from "@/lib/platform";
import "@/index.css";

// One entry, one window.
//
// This file used to decide which of four applications to mount by reading the
// Tauri window label: the main app, a picture-in-picture window, a transparent
// modal overlay window and an HDR overlay window. All three extras were desktop
// windows the OS put on top of the main one, and Android has no such thing —
// there is exactly one WebView, so the question no longer exists.
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
  const boot = document.getElementById("harbor-boot");
  if (!boot) return;
  boot.classList.add("gone");
  setTimeout(() => boot.remove(), 260);
});
