import type { PlayerBridge } from "./bridge";
import { createNativeBridge, isNativeEngineAvailable } from "./native-bridge";

/**
 * ExoPlayer: the television's own decoders, through Media3.
 *
 * The default on Android, because it is what the hardware is for — HEVC, 10-bit
 * and 4K at no cost in battery, and nothing to ship beyond a few megabytes of
 * Java. What it will not do is decode a format the device never learned, which
 * is where [`mpv`](./mpv-android.ts) takes over.
 */
const CONFIG = {
  globalName: "VioraPlayer",
  engine: "exo",
  // Media3's volume is a plain multiplier on the decoded samples, so anything
  // above unity is just clipping.
  maxVolume: 1,
} as const;

export function createExoBridge(): PlayerBridge {
  return createNativeBridge({ ...CONFIG });
}

export function isExoAvailable(): boolean {
  return isNativeEngineAvailable(CONFIG.globalName);
}
