import * as api from "@/lib/addons/local/albox-api";
import { resolveToAlbox } from "@/lib/addons/local/albox-resolve";
import type { SkipSegment } from "./types";

/**
 * Intro and end-credit marks published by Cinema Box.
 *
 * Unlike the scene marks Cinemana publishes, these are ordinary intro/outro
 * ranges — the same thing AniSkip and TheIntroDB provide — so they need no
 * opt-in and are offered as normal skips.
 *
 * Why the timeline is checked first
 * ---------------------------------
 * The marks are timestamps into Cinema Box's own encode. A torrent of the same
 * episode is a different file: a different cut, a distributor ident on the
 * front, a PAL transfer running 4% short. Replaying these timestamps over one of
 * those skips arbitrary footage, and the failure is silent, because a jump looks
 * the same whether or not it landed in the right place. If the file being played
 * runs the same length as theirs, to within a couple of seconds, it is the same
 * cut and the marks transfer.
 */

const ALIGNMENT_TOLERANCE_SEC = 2;
const TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; segments: SkipSegment[] | null }>();

/** The marks are milliseconds; everything downstream is seconds. */
function toSegments(marks: api.AlboxMarks | undefined, includeFlagged: boolean): SkipSegment[] {
  if (!marks) return [];
  const out: SkipSegment[] = [];
  const push = (kind: SkipSegment["kind"], range: { start?: number; end?: number } | undefined) => {
    const startSec = Number(range?.start) / 1000;
    const endSec = Number(range?.end) / 1000;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return;
    if (endSec <= startSec) return;
    out.push({ kind, startSec, endSec, source: "albox" });
  };

  push("intro", marks.intro);
  push("outro", marks.outro);

  // Content cuts are a different promise from an intro — they remove part of the
  // episode — so they are only offered to a viewer who has asked for them,
  // through the same setting Cinemana's scene marks answer to.
  if (includeFlagged) {
    for (const level of marks.levels ?? []) {
      for (const cut of level.cuts ?? []) push("flagged", cut);
    }
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Marks for the title being played, or an empty list when there are none, the
 * title is unknown to Cinema Box, or the file on screen is a different cut.
 *
 * `id` is whatever the app is playing — `abx:…` for Cinema Box's own catalogue,
 * `tt…` for anything else, with `:season:episode` appended for an episode.
 */
export async function fetchAlboxSceneSegments(
  id: string,
  playingDurationSec: number,
  includeFlagged = false,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  if (!(playingDurationSec > 0)) return [];

  const key = `${id}@${Math.round(playingDurationSec)}@${includeFlagged ? "cuts" : "plain"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.segments ?? [];

  try {
    const episodeId = await episodeIdFor(id, signal);
    if (episodeId == null) {
      cache.set(key, { at: Date.now(), segments: null });
      return [];
    }

    const files = await api.episodeFiles(episodeId, signal);
    const episode = (files.episodes ?? []).find((e) => Number(e.id) === episodeId);
    if (!episode) {
      cache.set(key, { at: Date.now(), segments: null });
      return [];
    }

    const theirDuration = Number(episode.length);
    const aligned =
      Number.isFinite(theirDuration) &&
      theirDuration > 0 &&
      Math.abs(theirDuration - playingDurationSec) <= ALIGNMENT_TOLERANCE_SEC;

    const segments = aligned ? toSegments(episode.parental_access, includeFlagged) : [];
    cache.set(key, { at: Date.now(), segments });
    return segments;
  } catch {
    return [];
  }
}

/** `abx:<show>:<episode>:<season>` carries it; anything else has to be matched. */
async function episodeIdFor(id: string, signal?: AbortSignal): Promise<number | null> {
  if (id.startsWith("abx:")) {
    const parts = id.slice(4).split(":");
    const showId = Number(parts[0]);
    if (parts.length > 1) {
      const episodeId = Number(parts[1]);
      return Number.isFinite(episodeId) ? episodeId : null;
    }
    if (!Number.isFinite(showId)) return null;
    const dyn = await api.dynamic(showId, undefined, signal);
    return dyn.post_info?.episode_id ?? null;
  }
  return (await resolveToAlbox(id, signal))?.episodeId ?? null;
}
