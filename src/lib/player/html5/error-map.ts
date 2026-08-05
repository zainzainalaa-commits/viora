import type { PlayerSnapshot } from "../bridge";

export function mapErrorCode(code: number): PlayerSnapshot["errorCode"] {
  if (code === MediaError.MEDIA_ERR_DECODE) return "decode";
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return "codec";
  if (code === MediaError.MEDIA_ERR_NETWORK) return "network";
  if (code === MediaError.MEDIA_ERR_ABORTED) return "source";
  return "unknown";
}

export function mapErrorMessage(code: number): string {
  if (code === MediaError.MEDIA_ERR_DECODE) {
    return "Codec not supported in WebView2. Falling back is required, or pick a different stream.";
  }
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This format isn't playable here. Try a different stream or wait for the mpv backend.";
  }
  if (code === MediaError.MEDIA_ERR_NETWORK) {
    return "Network error while loading the video.";
  }
  return "Playback failed.";
}
