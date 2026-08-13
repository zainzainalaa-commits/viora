import { useEffect, useRef, type RefObject } from "react";
import type { PlayerBridge, PlayerSnapshot, TrackInfo } from "@/lib/player/bridge";
import type { SubCue } from "@/lib/subtitles/parser";
import type { PlayerSrc } from "@/lib/view";
import { AUTO_SYNC_IDLE, autoSyncState, setAutoSyncState, useAutoSyncRequests } from "@/lib/player/sub-sync";
import { fingerprintCues, loadSync, saveSync, syncKey } from "@/lib/subtitles/sync/cache";
import { syncSubtitles, type SyncCandidate } from "@/lib/subtitles/sync/engine";
import { shiftFor } from "@/lib/subtitles/sync/model";

/**
 * Auto-sync against another subtitle of the same title.
 *
 * The other auto-sync in this player listens to the audio, which needs an ffmpeg
 * binary — on Android that call answers `ffmpeg-unavailable`, so on a television
 * it never runs at all. This one needs nothing but subtitles, and it does not
 * care what language any of them are in: any other track offered for this stream
 * is a candidate reference, and the engine picks by measuring which one behaves
 * like a transcript of the same conversation.
 *
 * Corrections are applied as a transformation over the parsed cues. The file is
 * never rewritten, so switching the feature off is immediate and nothing on disk
 * changed.
 */

/** How many unselected tracks are worth downloading to act as a clock. */
const MAX_REFERENCE_FETCHES = 2;

/** How long one reference may take to arrive before it is given up on. */
const REFERENCE_FETCH_MS = 12_000;

/** And how long the whole gathering may take, however many that turns out to be. */
const COLLECT_MS = 20_000;

/**
 * Which tracks to read first.
 *
 * A subtitle in another language is almost certainly an independent translation,
 * while a second file in the same language is quite often the same file from
 * another mirror — mistimed in exactly the same way, and therefore useless as a
 * clock. This only decides download order; whether a track is actually usable is
 * settled by measurement inside the engine.
 */
function referenceOrder(tracks: TrackInfo[], selected: TrackInfo | undefined): TrackInfo[] {
  const selLang = (selected?.lang ?? "").toLowerCase();
  return [...tracks]
    .filter((t) => t.id !== selected?.id)
    .sort((a, b) => {
      const aOther = (a.lang ?? "").toLowerCase() !== selLang ? 0 : 1;
      const bOther = (b.lang ?? "").toLowerCase() !== selLang ? 0 : 1;
      return aOther - bOther;
    });
}


/**
 * Whether two subtitles are the same timings under different words.
 *
 * A mirror is worthless as a clock. It agrees with the selected file perfectly,
 * which makes it win on fit against every honest reference, and the answer it
 * gives is always "no correction needed" — including when the pair is wrong
 * together. Measured on real files, an independent translation of the same
 * release still disagrees by a few tenths on most lines; a mirror sits inside a
 * frame of it almost everywhere.
 */
function isMirror(a: SubCue[], b: SubCue[]): boolean {
  if (a.length < 20 || b.length < 20) return false;
  if (Math.abs(a.length - b.length) > a.length * 0.02) return false;
  const left = a.map((c) => c.start).sort((x, y) => x - y);
  const right = b.map((c) => c.start).sort((x, y) => x - y);
  let j = 0;
  let close = 0;
  for (const t of left) {
    while (j + 1 < right.length && Math.abs(right[j + 1] - t) < Math.abs(right[j] - t)) j += 1;
    if (Math.abs(right[j] - t) <= 0.05) close += 1;
  }
  return close / left.length > 0.9;
}

export function useReferenceSync(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
}): void {
  const { bridgeRef, src, snap } = params;
  const requests = useAutoSyncRequests();
  const doneKeyRef = useRef<string | null>(null);

  const selectedId = snap.subtitleTracks.find((t) => t.selected)?.id ?? null;
  const trackIds = snap.subtitleTracks.map((t) => t.id).join(",");

  // The snapshot is a fresh object five times a second. Only the three values
  // above are allowed to restart the analysis; everything else is read through a
  // ref, or the effect would tear itself down before it ever finished.
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // A different subtitle is a different question. Whatever was measured for the
  // last one is dropped, and its correction with it, so nothing claims to have
  // been checked that has not been.
  useEffect(() => {
    doneKeyRef.current = null;
    setAutoSyncState(AUTO_SYNC_IDLE);
  }, [selectedId]);

  // Leaving the player: the next thing opened starts from nothing.
  useEffect(() => () => setAutoSyncState(AUTO_SYNC_IDLE), []);

  useEffect(() => {
    if (requests === 0) return;
    const b = bridgeRef.current;
    if (!b || !selectedId || snap.durationSec < 60) return;
    if (!b.applySubtitleSync || !b.getTrackCues) {
      setAutoSyncState({ ...AUTO_SYNC_IDLE, trackId: selectedId, status: "unavailable" });
      return;
    }

    const tracks = snapRef.current.subtitleTracks;
    const selected = tracks.find((t) => t.id === selectedId);
    const durationSec = snapRef.current.durationSec;

    let cancelled = false;

    /**
     * A promise that is not allowed to take all evening.
     *
     * Every wait here ends in a fetch, and a fetch on a television has no
     * natural end — a subtitle host that accepts the connection and then says
     * nothing leaves the request open, and with it the "Checking subtitle
     * timing…" line, forever. Measured: thirty-five seconds still spinning.
     */
    const withDeadline = async <T,>(work: Promise<T>, ms: number): Promise<T | null> => {
      let timer = 0;
      const expiry = new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), ms);
      });
      try {
        return await Promise.race([work, expiry]);
      } finally {
        window.clearTimeout(timer);
      }
    };

    /**
     * Cues for a track, waiting if the download is already in flight.
     *
     * The viewer's own subtitle starts loading the moment it is selected, and
     * asking for it a frame later would get nothing back. There is no readiness
     * flag on a track, so this asks for the fetch and then waits for the parse,
     * which is the same thing the subtitle renderer does.
     */
    const cuesFor = async (id: string) => {
      const have = b.getTrackCues?.(id);
      if (have?.length) return have;
      void b.loadTrackCues?.(id);
      for (let i = 0; i < 40 && !cancelled; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        const cues = b.getTrackCues?.(id);
        if (cues?.length) return cues;
      }
      return null;
    };

    const collect = async (selectedCues: SubCue[]): Promise<SyncCandidate[]> => {
      // A mirror of the file the viewer already has is not a second opinion. It
      // would agree with itself perfectly and report a confident zero, which
      // reads as "these are fine" for a subtitle that is not fine.
      const own = fingerprintCues(selectedCues);
      const out: SyncCandidate[] = [];
      let fetches = 0;
      for (const t of referenceOrder(tracks, selected)) {
        if (cancelled) break;
        let cues = b.getTrackCues?.(t.id) ?? null;
        if (!cues) {
          if (fetches >= MAX_REFERENCE_FETCHES) continue;
          fetches += 1;
          const pending = b.loadTrackCues?.(t.id);
          cues = pending ? await withDeadline(pending, REFERENCE_FETCH_MS) : null;
        }
        if (cues && cues.length >= 20 && fingerprintCues(cues) !== own) {
          out.push({ id: t.id, lang: t.lang, label: t.label || t.lang, cues });
        }
      }
      // A mirror only ever answers "nothing to change", so it is kept as a last
      // resort and never allowed to outrank a reference with something to say.
      const independent = out.filter((r) => !isMirror(selectedCues, r.cues));
      return independent.length > 0 ? independent : out;
    };

    const run = async () => {
      const selectedCues = await cuesFor(selectedId);
      if (cancelled) return;
      if (!selectedCues || selectedCues.length < 20) {
        setAutoSyncState({ ...AUTO_SYNC_IDLE, trackId: selectedId, status: "unavailable" });
        return;
      }

      // The cheap answer first: a track already read this session, so a rewind
      // or a menu visit costs nothing.
      const known = tracks
        .filter((t) => t.id !== selectedId && (b.getTrackCues?.(t.id)?.length ?? 0) >= 20)
        .map((t) => t.id);
      const cachedKey = syncKey(src.url, selectedCues, known);
      const cached = known.length > 0 ? loadSync(cachedKey) : null;
      if (cached) {
        doneKeyRef.current = cachedKey;
        b.applySubtitleSync?.(selectedId, shiftFor(cached.model));
        setAutoSyncState({
          status: "synced",
          trackId: selectedId,
          referenceLabel: cached.referenceLabel,
          offsetSec: shiftFor(cached.model)(durationSec / 2),
          driftCorrected: cached.driftCorrected,
          confidence: cached.confidence,
          anchors: cached.anchors,
        });
        return;
      }

      // Kept so the answer can be put back if this turns out to be work that
      // was already done — the message must not be left mid-sentence.
      const before = autoSyncState();
      setAutoSyncState({ ...AUTO_SYNC_IDLE, trackId: selectedId, status: "analyzing" });

      const references = (await withDeadline(collect(selectedCues), COLLECT_MS)) ?? [];
      if (cancelled) return;
      if (references.length === 0) {
        setAutoSyncState({ ...AUTO_SYNC_IDLE, trackId: selectedId, status: "unavailable" });
        return;
      }

      const key = syncKey(src.url, selectedCues, references.map((r) => r.id));
      if (doneKeyRef.current === key) {
        setAutoSyncState(before.status === "analyzing" ? { ...AUTO_SYNC_IDLE, status: "unavailable" } : before);
        return;
      }
      doneKeyRef.current = key;

      const hit = loadSync(key);
      if (hit) {
        b.applySubtitleSync?.(selectedId, shiftFor(hit.model));
        setAutoSyncState({
          status: "synced",
          trackId: selectedId,
          referenceLabel: hit.referenceLabel,
          offsetSec: shiftFor(hit.model)(durationSec / 2),
          driftCorrected: hit.driftCorrected,
          confidence: hit.confidence,
          anchors: hit.anchors,
        });
        return;
      }

      const report = syncSubtitles(
        { id: selectedId, lang: selected?.lang, label: selected?.label, cues: selectedCues },
        references,
        { durationSec },
      );
      if (cancelled) return;

      if (!report.applied) {
        b.clearSubtitleSync?.(selectedId);
        setAutoSyncState({
          status: "declined",
          trackId: selectedId,
          referenceLabel: report.referenceLabel,
          offsetSec: 0,
          driftCorrected: false,
          confidence: report.confidence,
          anchors: report.anchors,
          reason: report.reason,
        });
        return;
      }

      b.applySubtitleSync?.(selectedId, report.shift);
      saveSync(key, {
        model: report.model,
        confidence: report.confidence,
        referenceId: report.referenceId,
        referenceLabel: report.referenceLabel,
        anchors: report.anchors,
        driftCorrected: report.driftCorrected,
      });
      setAutoSyncState({
        status: "synced",
        trackId: selectedId,
        referenceLabel: report.referenceLabel,
        offsetSec: report.shift(durationSec / 2),
        driftCorrected: report.driftCorrected,
        confidence: report.confidence,
        anchors: report.anchors,
      });
    };

    // Off the frame the menu is rendering on: a two-hour film takes about half a
    // second to align, which is long enough to be seen as a stutter.
    const timer = window.setTimeout(() => void run(), 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requests, selectedId, trackIds, snap.durationSec, src.url, bridgeRef]);
}
