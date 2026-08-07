export type PlatformOS =
  | "windows"
  | "macos"
  | "linux"
  | "android"
  | "ios"
  | "web";

export type FormFactor = "desktop" | "tv" | "tablet" | "phone";

function ua(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

function touchPoints(): number {
  if (typeof navigator === "undefined") return 0;
  return navigator.maxTouchPoints ?? 0;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isWeb(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

// Set by the Rust side at boot (see platform_info command). UA sniffing is the
// fallback: inside a WebView the UA is the only signal available before the
// bridge is ready, and on TV boxes it is often the only signal at all.
let nativeOS: PlatformOS | null = null;
let nativeIsTV: boolean | null = null;

export function setNativePlatform(os: PlatformOS, tv?: boolean): void {
  nativeOS = os;
  if (typeof tv === "boolean") nativeIsTV = tv;
  cachedOS = null;
  cachedFormFactor = null;
}

let cachedOS: PlatformOS | null = null;

export function platformOS(): PlatformOS {
  if (cachedOS) return cachedOS;
  cachedOS = detectOS();
  return cachedOS;
}

function detectOS(): PlatformOS {
  if (nativeOS) return nativeOS;
  const u = ua().toLowerCase();
  // Order matters: Android reports "linux" too, and iPadOS reports "macintosh".
  if (u.includes("android")) return isTauri() ? "android" : "web";
  if (/iphone|ipad|ipod/.test(u)) return isTauri() ? "ios" : "web";
  if (/macintosh|mac os/.test(u) && touchPoints() > 1) {
    // iPadOS 13+ desktop-class UA. Only a real iPad has touch here.
    return isTauri() ? "ios" : "web";
  }
  if (!isTauri()) return "web";
  if (u.includes("windows")) return "windows";
  if (/macintosh|mac os/.test(u)) return "macos";
  if (u.includes("linux")) return "linux";
  return "web";
}

export function isAndroid(): boolean {
  return platformOS() === "android";
}

export function isIOS(): boolean {
  return platformOS() === "ios";
}

/** Any native mobile-OS build (phone, tablet or Android TV). */
export function isMobileOS(): boolean {
  const os = platformOS();
  return os === "android" || os === "ios";
}

export function isDesktopOS(): boolean {
  const os = platformOS();
  return os === "windows" || os === "macos" || os === "linux";
}

export function isLinuxDesktop(): boolean {
  return platformOS() === "linux";
}

export function isMacDesktop(): boolean {
  return platformOS() === "macos";
}

export function isWindowsDesktop(): boolean {
  return platformOS() === "windows";
}

// Fire TV sticks report AFTB/AFTS/AFTM/AFTT..., Google's Android TV images carry
// "atv" in the model, Tizen/webOS/VIDAA are their own thing.
const TV_UA = /\b(smart-?tv|googletv|android\s?tv|atv\d*|bravia|aft[a-z]{1,3}\b|hbbtv|netcast|vidaa|roku|tizen|web0s|webos|crkey|philipstv|netfrontlifebrowser)\b/i;

/**
 * Checked against a real Android TV WebView, where the obvious signals all lie:
 * the UA still ends in "Mobile Safari", `maxTouchPoints` reports 5 despite there
 * being no touchscreen, and `(tv: tv)` is not implemented. What does hold is
 * that a TV has no pointing device at all — `(pointer: none)` — because the only
 * input is a D-pad. That is the primary test; the UA is the fallback for hosts
 * that claim a pointer anyway.
 */
export function isTVDevice(): boolean {
  if (nativeIsTV !== null) return nativeIsTV;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(pointer: none)").matches) return true;
      if (window.matchMedia("(tv: tv)").matches) return true;
    } catch {
      /* unsupported query */
    }
  }
  return TV_UA.test(ua());
}

export function isAndroidTV(): boolean {
  return isAndroid() && isTVDevice();
}

let cachedFormFactor: FormFactor | null = null;

/**
 * `?formFactor=tv` forces the TV build on a desktop browser.
 *
 * D-pad navigation is the one part of the app that cannot be judged from the
 * desktop it was written on, and a full APK cycle is a poor feedback loop for
 * something you need to try a hundred times. This makes a laptop with arrow keys
 * an honest test rig. It only reads a URL parameter, so nothing about a real
 * device changes.
 */
function forcedFormFactor(): FormFactor | null {
  if (typeof window === "undefined") return null;
  try {
    const want = new URLSearchParams(window.location.search).get("formFactor");
    if (want === "tv" || want === "phone" || want === "tablet" || want === "desktop") return want;
  } catch {
    /* opaque location */
  }
  return null;
}

export function formFactor(): FormFactor {
  if (cachedFormFactor) return cachedFormFactor;
  cachedFormFactor = forcedFormFactor() ?? detectFormFactor();
  return cachedFormFactor;
}

function detectFormFactor(): FormFactor {
  if (isTVDevice()) return "tv";
  if (isDesktopOS()) return "desktop";
  if (typeof window === "undefined") return "desktop";
  const u = ua();
  if (/ipad/i.test(u)) return "tablet";
  if (/macintosh|mac os/i.test(u) && touchPoints() > 1) return "tablet";
  const shortest = Math.min(window.innerWidth, window.innerHeight);
  if (isMobileOS()) return shortest >= 600 ? "tablet" : "phone";
  return touchPoints() > 0 && shortest < 640 ? "phone" : "desktop";
}

/** Re-evaluate the form factor after a rotation or window resize. */
export function refreshFormFactor(): FormFactor {
  cachedFormFactor = null;
  return formFactor();
}

export function isPhone(): boolean {
  return formFactor() === "phone";
}

export function isTablet(): boolean {
  return formFactor() === "tablet";
}

export function isTV(): boolean {
  return formFactor() === "tv";
}

/** True where the primary input is a finger, not a mouse or a D-pad. */
export function isTouchPrimary(): boolean {
  const ff = formFactor();
  if (ff === "tv") return false;
  if (ff === "phone" || ff === "tablet") return true;
  return touchPoints() > 0 && !hasFinePointer();
}

/** True where the primary input is a remote's D-pad. */
export function isDpadPrimary(): boolean {
  return formFactor() === "tv";
}

function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return true;
  }
}

/**
 * Kept for callers that only care "is this a small touch screen", including the
 * browser build where there is no Tauri bridge at all.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const u = ua();
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|iPad/i.test(u)) {
    return !isTVDevice();
  }
  if (/Macintosh/i.test(u) && touchPoints() > 1) return true;
  if (touchPoints() > 0 && Math.min(window.innerWidth, window.innerHeight) < 640) {
    return true;
  }
  return false;
}
