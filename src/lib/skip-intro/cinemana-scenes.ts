import * as api from "@/lib/addons/local/cinemana-api";
import { resolveToCinemanaId } from "@/lib/addons/local/cinemana-resolve";
import type { SkipSegment } from "./types";

/**
 * Scenes Cinemana marks as cut, offered as skips for family viewing.
 *
 * Why this cannot simply be applied to every source
 * -------------------------------------------------
 * The marks are timestamps into Cinemana's own encode. A torrent of the same
 * film is a different file: an extended cut, a release with a distributor
 * ident, a PAL transfer running 4% short. Replaying Cinemana's timestamps over
 * one of those skips arbitrary footage — and the failure is silent, because a
 * jump looks the same whether or not it landed in the right place.
 *
 * So the timeline is checked before the marks are trusted: if the file being
 * played runs the same length as Cinemana's, to within a couple of seconds, it
 * is the same cut and the marks transfer. That makes the feature work with
 * Torrentio and everything else whenever it is genuinely safe, and refuse
 * quietly when it is not, without asking the viewer to know any of this.
 */

// Two seconds covers rounding between a container's declared duration and
// Cinemana's, while still rejecting a different cut — the shortest gap between
// releases of the same film is far wider than this.
const ALIGNMENT_TOLERANCE_SEC = 2;

const cache = new Map<string, { at: number; segments: SkipSegment[] | null }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function toSegments(ranges: api.CinemanaSkipRanges): SkipSegment[] {
  const starts = ranges.start ?? [];
  const ends = ranges.end ?? [];
  const out: SkipSegment[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const startSec = Number(starts[i]);
    const endSec = Number(ends[i]);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    if (endSec <= startSec) continue;
    out.push({ kind: "flagged", startSec, endSec, source: "cinemana" });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Marks for the title being played, or an empty list when there are none, the
 * title is unknown to Cinemana, or the file on screen is a different cut.
 *
 * `id` is whatever the app is playing — `cnm:…` for Cinemana's own catalogue,
 * `tt…` for anything else, with `:season:episode` appended for an episode.
 */
export async function fetchCinemanaSceneSegments(
  id: string,
  playingDurationSec: number,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  if (!(playingDurationSec > 0)) return [];

  const key = `${id}@${Math.round(playingDurationSec)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.segments ?? [];

  try {
    const nb = await resolveToCinemanaId(id, signal);
    if (!nb) {
      cache.set(key, { at: Date.now(), segments: null });
      return [];
    }

    const [ranges, info] = await Promise.all([
      api.skippingDurations(nb, signal),
      api.videoInfo(nb, signal).catch(() => null),
    ]);

    const theirDuration = info ? api.durationSecondsOf(info) : null;
    const aligned =
      theirDuration != null &&
      Math.abs(theirDuration - playingDurationSec) <= ALIGNMENT_TOLERANCE_SEC;

    const segments = aligned ? toSegments(ranges) : [];
    cache.set(key, { at: Date.now(), segments });
    return segments;
  } catch {
    return [];
  }
}
