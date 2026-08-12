import { formFactor, isIOS, isMobileOS, platformOS } from "@/lib/platform";

/**
 * Every host-dependent feature Harbor gates on. Adding a platform means filling
 * this table in once instead of sprinkling `isAndroid()` across the views.
 */
export type Capability =
  // playback
  | "mpvEngine"
  | "exoEngine"
  | "hdrPassthrough"
  | "shaderUpscale"
  | "motionInterpolation"
  | "audioEqualizer"
  // ffmpeg / yt-dlp sidecars
  | "transcode"
  | "thumbnailScrub"
  | "trailerExtract"
  | "subtitleExtract"
  | "dvrRecording"
  | "clipCapture"
  | "screenshotCapture"
  // windowing
  | "multiWindow"
  | "multiview"
  | "windowPip"
  | "documentPip"
  | "nativePip"
  | "customTitlebar"
  | "systemTray"
  | "windowState"
  // system integration
  | "discordPresence"
  | "autoUpdater"
  | "deepLinks"
  | "deepLinkRegistration"
  | "powerInhibit"
  | "processMemoryStats"
  | "externalBrowserWindow"
  | "localFolderScan"
  | "fileAssociations"
  // network
  | "torrentEngine"
  | "castChromecast"
  | "castDlna"
  | "castRoku"
  | "castAirplay"
  | "localWebServer";

type Table = Record<Capability, boolean>;

function desktopTable(): Table {
  const os = platformOS();
  return {
    mpvEngine: true,
    exoEngine: false,
    hdrPassthrough: os === "windows",
    shaderUpscale: true,
    motionInterpolation: os === "windows",
    audioEqualizer: true,

    transcode: true,
    thumbnailScrub: true,
    trailerExtract: true,
    subtitleExtract: true,
    dvrRecording: true,
    clipCapture: true,
    screenshotCapture: true,

    multiWindow: true,
    multiview: true,
    windowPip: true,
    documentPip: true,
    nativePip: true,
    customTitlebar: true,
    systemTray: true,
    windowState: true,

    discordPresence: true,
    autoUpdater: true,
    deepLinks: true,
    deepLinkRegistration: true,
    powerInhibit: true,
    processMemoryStats: true,
    externalBrowserWindow: true,
    localFolderScan: true,
    fileAssociations: true,

    torrentEngine: true,
    castChromecast: true,
    castDlna: true,
    castRoku: true,
    castAirplay: os === "macos",
    localWebServer: true,
  };
}

function mobileTable(): Table {
  const ios = isIOS();
  const tv = formFactor() === "tv";
  return {
    // No libmpv on either mobile OS: building it for the NDK is a separate
    // project, and nothing here ships the .so.
    mpvEngine: false,
    // Android has its own answer to the same problem. ExoPlayer drives the
    // device's hardware decoders, which is the whole reason a television plays
    // HEVC and 4K that a webview <video> turns down. iOS has no equivalent the
    // app can reach from a WKWebView host.
    exoEngine: !ios,
    hdrPassthrough: false,
    shaderUpscale: false,
    motionInterpolation: false,
    audioEqualizer: false,

    // iOS forbids spawning processes outright; Android blocks execution from
    // the app data dir since API 29. Both kill the ffmpeg/yt-dlp sidecars.
    transcode: false,
    thumbnailScrub: false,
    trailerExtract: false,
    subtitleExtract: false,
    dvrRecording: false,
    clipCapture: false,
    screenshotCapture: false,

    multiWindow: false,
    multiview: false,
    windowPip: false,
    documentPip: false,
    // Android and iOS both have an OS-level PiP for video; TV boxes do not.
    nativePip: !tv,
    customTitlebar: false,
    systemTray: false,
    windowState: false,

    discordPresence: false,
    autoUpdater: false,
    deepLinks: true,
    // Schemes are declared in AndroidManifest.xml at build time; there is no
    // runtime register/unregister call the way there is on desktop.
    deepLinkRegistration: false,
    powerInhibit: true,
    processMemoryStats: false,
    externalBrowserWindow: false,
    // Android reads shared storage through SAF; the iOS sandbox has no
    // equivalent browsable media tree.
    localFolderScan: !ios,
    fileAssociations: !ios,

    torrentEngine: true,
    castChromecast: true,
    castDlna: true,
    castRoku: true,
    castAirplay: ios,
    localWebServer: true,
  };
}

function webTable(): Table {
  const base = mobileTable();
  return {
    ...base,
    exoEngine: false,
    nativePip: true,
    documentPip: true,
    deepLinks: false,
    deepLinkRegistration: false,
    powerInhibit: true,
    torrentEngine: false,
    castChromecast: false,
    castDlna: false,
    castRoku: false,
    castAirplay: false,
    localWebServer: false,
    localFolderScan: false,
    fileAssociations: false,
  };
}

let cached: Table | null = null;

export function capabilities(): Table {
  if (cached) return cached;
  const os = platformOS();
  cached = os === "web" ? webTable() : isMobileOS() ? mobileTable() : desktopTable();
  return cached;
}

export function can(capability: Capability): boolean {
  return capabilities()[capability];
}

/** Invalidate after a platform override arrives from the Rust side. */
export function resetCapabilities(): void {
  cached = null;
}
