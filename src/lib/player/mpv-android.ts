import type { PlayerBridge } from "./bridge";
import { createNativeBridge, isNativeEngineAvailable } from "./native-bridge";

/**
 * mpv on Android: libmpv, with ffmpeg, libass and libplacebo inside it.
 *
 * The same engine the desktop build used, so the behaviour a viewer already
 * knows carries over — but reached through a JavaScript bridge into the app's
 * own process rather than the Tauri commands in [`mpv.ts`](./mpv.ts), which do
 * not exist in the Android build. Everything here is the shared native bridge;
 * only the three lines below differ from ExoPlayer.
 */
const CONFIG = {
  globalName: "VioraMpv",
  engine: "mpv",
  // mpv's own volume control amplifies, which is why the player offers a boost
  // above 100% on this engine and not on the other one.
  maxVolume: 6,
} as const;

export function createMpvAndroidBridge(): PlayerBridge {
  return createNativeBridge({ ...CONFIG });
}

export function isMpvAndroidAvailable(): boolean {
  return isNativeEngineAvailable(CONFIG.globalName);
}
