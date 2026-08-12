import { useCallback, type RefObject } from "react";
import { savePlayback } from "@/lib/playback-history";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { saveResumeMs } from "@/lib/resume";
import type { PartialSyncState } from "@/lib/together/provider";
import type { PlayerSrc, PlayerStreamRef } from "@/lib/view";

const REMEMBER_MIN_SEC = 30;

export function usePlayerExit(params: {
  src: PlayerSrc;
  season: number | undefined;
  episode: number | undefined;
  liveUrl: string;
  liveStreamRef: PlayerStreamRef | undefined;
  inRoom: boolean;
  isHost: boolean;
  captureExitSnapshot: () => Promise<void>;
  exitPip: () => Promise<void>;
  castActiveRef: RefObject<boolean>;
  stopCast: () => Promise<void>;
  publishState: (state: PartialSyncState) => void;
  notifyHostLeaving: () => void;
  clearInvite: () => void;
  exitPlayback: () => void;
}) {
  const {
    src,
    season,
    episode,
    liveUrl,
    liveStreamRef,
    inRoom,
    isHost,
    captureExitSnapshot,
    exitPip,
    castActiveRef,
    stopCast,
    publishState,
    notifyHostLeaving,
    clearInvite,
    exitPlayback,
  } = params;

  const closePlayer = useCallback(async () => {
    await captureExitSnapshot();
    const pos = getPlaybackPosition();
    if (Number.isFinite(pos) && pos > 0) {
      saveResumeMs(src.meta.id, pos * 1000, season, episode);
      if (liveStreamRef && pos >= REMEMBER_MIN_SEC) {
        savePlayback(
          src.meta.id,
          { ...liveStreamRef, url: liveUrl || src.url, title: src.meta.name },
          season,
          episode,
        );
      }
    }
    await exitPip();
    if (castActiveRef.current) await stopCast().catch(() => {});
    if (inRoom && isHost) {
      publishState({
        mediaId: null,
        mediaTitle: null,
        episode: null,
        posterUrl: null,
        positionSeconds: 0,
        playing: false,
      });
      notifyHostLeaving();
      clearInvite();
    }
    exitPlayback();
  }, [captureExitSnapshot, exitPlayback, src.meta.id, src.meta.name, season, episode, inRoom, isHost, notifyHostLeaving, clearInvite, publishState, exitPip, liveStreamRef, liveUrl, src.url, stopCast, castActiveRef]);

  return { closePlayer };
}
