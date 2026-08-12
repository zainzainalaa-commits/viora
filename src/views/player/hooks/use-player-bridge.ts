import { useEffect, useRef, useState, type RefObject } from "react";
import { type PlayerEngine, emptySnapshot, type PlayerBridge, type PlayerSnapshot } from "@/lib/player/bridge";
import { probeMpv } from "@/lib/player/mpv";
import { isMpvAndroidAvailable } from "@/lib/player/mpv-android";
import { isExoAvailable } from "@/lib/player/exo";
import { can } from "@/lib/capabilities";
import type { PlayerSrc } from "@/lib/view";
import type { Settings } from "@/lib/settings";
import { getPlaybackPosition, setPlaybackClock } from "@/lib/player/playback-clock";
import { isWindowsDesktop } from "@/lib/platform";
import { svpEnsureRunning } from "@/lib/svp";
import { pickBridge } from "../player-utils";

function snapChangedIgnoringClock(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  return (
    a.status !== b.status ||
    a.durationSec !== b.durationSec ||
    a.volume !== b.volume ||
    a.muted !== b.muted ||
    a.rate !== b.rate ||
    a.audioTracks !== b.audioTracks ||
    a.subtitleTracks !== b.subtitleTracks ||
    a.chapters !== b.chapters ||
    a.subDelaySec !== b.subDelaySec ||
    a.audioDelaySec !== b.audioDelaySec ||
    a.subText !== b.subText ||
    a.subStartSec !== b.subStartSec ||
    a.audioNormalize !== b.audioNormalize ||
    a.videoWidth !== b.videoWidth ||
    a.videoHeight !== b.videoHeight ||
    a.hdrGamma !== b.hdrGamma ||
    a.errorMessage !== b.errorMessage ||
    a.errorCode !== b.errorCode
  );
}

export function usePlayerBridge(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  videoMountRef: RefObject<HTMLDivElement | null>;
  src: PlayerSrc;
  settings: Settings;
  /** Where the next load should start, when a switch has to keep the place. */
  resumeOverrideRef: RefObject<number | null>;
}) {
  const { bridgeRef, videoMountRef, src, settings, resumeOverrideRef } = params;

  const [snap, setSnap] = useState<PlayerSnapshot>(emptySnapshot);
  const prevSnapRef = useRef<PlayerSnapshot>(emptySnapshot);
  const [engine, setEngine] = useState<PlayerEngine>("exo");
  const [autoFallbackTried, setAutoFallbackTried] = useState(false);
  // Chosen from inside the player, for this stream only. The setting in
  // Settings is what the next film starts on; this is the viewer saying "not
  // this one, try the other engine" without leaving what they are watching.
  const [engineOverride, setEngineOverride] = useState<PlayerEngine | null>(null);
  useEffect(() => {
    setEngineOverride(null);
  }, [src.url]);

  const hdrOpaqueWindow = isWindowsDesktop() && settings.playerHdrOpaqueWindow;
  const embedActive = settings.playerMpvEmbed && !hdrOpaqueWindow;
  const isAnimeSrc =
    !!src.meta.id?.startsWith("kitsu:") ||
    !!src.meta.id?.startsWith("mal:") ||
    !!src.meta.id?.startsWith("anilist:") ||
    !!src.meta.id?.startsWith("anidb:") ||
    (src.meta.genres ?? []).some((g) => {
      const l = g.toLowerCase();
      return l === "anime" || l === "animation";
    });
  const anime4kOn = settings.playerAnime4k && (!settings.playerAnime4kAnimeOnly || isAnimeSrc);
  const svpOn =
    settings.playerSvp &&
    !!settings.svpVpyPath &&
    (settings.svpScope === "all" || (settings.svpScope === "anime" ? isAnimeSrc : !isAnimeSrc));
  useEffect(() => {
    if (svpOn) void svpEnsureRunning().catch(() => {});
  }, [svpOn]);
  // Where to escalate when the chosen engine cannot decode what it was handed:
  // whichever engine on this device plays the most, which is mpv wherever mpv
  // exists — compiled into the app on Android, installed alongside it on the
  // desktop. ExoPlayer is the answer only where there is no mpv at all.
  const fallbackEngine: PlayerEngine =
    can("mpvEngine") || isMpvAndroidAvailable() ? "mpv" : "exo";
  // Live channels used to be forced onto the web layer, decoding HLS in
  // JavaScript. Both native engines demux HLS and MPEG-TS themselves, with the
  // television's own decoders, so a channel is now just another stream.
  const chosenEngine = engineOverride
    ? engineOverride
    : autoFallbackTried
      ? fallbackEngine
      : settings.playerEngine;
  const bridgeKey = `${chosenEngine}|${anime4kOn}|${settings.playerHdrToSdr}|${embedActive}|${anime4kOn ? settings.playerAnime4kShaders.join(",") : ""}|${svpOn}|${svpOn ? settings.svpVpyPath : ""}`;
  const [bridgeReady, setBridgeReady] = useState(false);
  useEffect(() => {
    const host = videoMountRef.current;
    if (!host) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    let bridge: PlayerBridge | null = null;
    setBridgeReady(false);
    (async () => {
      const { bridge: choose, engine: chosen } = await pickBridge(chosenEngine);
      if (cancelled) return;
      bridge = choose;
      bridge.attach(host);
      bridgeRef.current = bridge;
      setEngine(chosen);
      off = bridge.subscribe((s) => {
        setPlaybackClock(s.positionSec, s.bufferedSec);
        if (snapChangedIgnoringClock(prevSnapRef.current, s)) {
          prevSnapRef.current = s;
          setSnap(s);
        }
      });
      setBridgeReady(true);
    })();
    return () => {
      cancelled = true;
      setBridgeReady(false);
      off?.();
      bridge?.destroy();
      bridgeRef.current = null;
      setPlaybackClock(0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeKey]);

  useEffect(() => {
    if (autoFallbackTried) return;
    // Already on the most capable engine this device has: there is nowhere
    // left to escalate to, and retrying would only loop.
    if (engine === fallbackEngine) return;
    // The viewer picked this engine by hand from inside the player. Swapping it
    // out from under them is precisely what they were overriding.
    if (engineOverride) return;
    if (settings.playerEngine !== "auto") return;
    if (snap.errorCode !== "decode" && snap.errorCode !== "codec" && !snap.noAudio) return;
    if (isMpvAndroidAvailable()) {
      // Nothing to probe: the engine is compiled into the app.
      setAutoFallbackTried(true);
      return;
    }
    (async () => {
      const probe = await probeMpv();
      if (probe.available) setAutoFallbackTried(true);
    })();
  }, [engine, fallbackEngine, engineOverride, autoFallbackTried, snap.errorCode, snap.noAudio, settings.playerEngine]);

  /**
   * The other engine this device has, or null when there is no choice to offer.
   *
   * Live channels are excluded: they run on the web layer, and moving one of
   * those to a native engine mid-stream is a different piece of work.
   */
  const alternateEngine: PlayerEngine | null =
    isExoAvailable() && isMpvAndroidAvailable()
      ? engine === "mpv"
        ? "exo"
        : "mpv"
      : null;

  /**
   * Swaps the engine under the same stream, keeping the viewer's place.
   *
   * The position is handed to the next bridge rather than left to the resume
   * store: that store is also what the "resume or start over" question reads,
   * and being asked that after pressing a button in the player would be absurd.
   */
  const switchEngine = () => {
    if (!alternateEngine) return;
    // From the clock, not the snapshot: `snapChangedIgnoringClock` deliberately
    // withholds position-only updates from React, so `snap.positionSec` here is
    // whatever it was when some *other* field last changed. Reading it sent the
    // viewer back to the start of the film.
    resumeOverrideRef.current = Math.max(0, getPlaybackPosition() - 1);
    setEngineOverride(alternateEngine);
  };

  return { snap, engine, bridgeReady, bridgeKey, embedActive, alternateEngine, switchEngine };
}
