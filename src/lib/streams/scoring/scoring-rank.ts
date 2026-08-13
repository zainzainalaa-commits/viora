import type { DebridSlug, RankedPicker, ScoredStream, Tier } from "../types";
import { hasUncachedMarker } from "../cached";

export function rankAndPick(
  scored: ScoredStream[],
  activeDebrids: DebridSlug[],
  preferAac = false,
  respectAddonOrder = false,
): RankedPicker {
  const isCached = (s: ScoredStream) =>
    (s.url != null && !hasUncachedMarker(s)) || activeDebrids.some((slug) => s.cached[slug] === true);

  const pri = (s: ScoredStream) => s.addonPriority ?? Number.MAX_SAFE_INTEGER;
  const ret = (s: ScoredStream) => s.addonReturnIdx ?? Number.MAX_SAFE_INTEGER;
  const all = scored
    .slice()
    .sort((a, b) =>
      respectAddonOrder ? pri(a) - pri(b) || ret(a) - ret(b) || b.score - a.score : b.score - a.score,
    );
  const cachedFirst = all.slice().sort((a, b) => {
    const ac = isCached(a) ? 1 : 0;
    const bc = isCached(b) ? 1 : 0;
    return bc - ac;
  });

  const byTier: Partial<Record<Tier, ScoredStream>> = {};
  for (const s of cachedFirst) {
    if (!byTier[s.tier]) byTier[s.tier] = s;
  }

  let primary = all.find((s) => isCached(s)) ?? null;
  if (preferAac && primary) {
    const aac = all.find((s) => isCached(s) && s.audio?.codec === "AAC");
    if (aac) primary = aac;
  }

  return { primary, byTier, all: everyAddonRepresented(all) };
}

/**
 * Lifts each addon's best result to the head of the list.
 *
 * The order is by score, which is right until an account brings in a dozen
 * addons: measured on one episode, Torrentio returned 107 results, StremThru 53
 * and Comet 39, against six from Cinemana — so the first several screens were
 * torrents and the addon a viewer actually wanted looked like it had stopped
 * working. It had not; it was two hundred rows down.
 *
 * So the head of the list holds one result from every addon that returned
 * anything, each of them that addon's best, in the order those bests already
 * had. Nothing is hidden, nothing is promoted above something better from an
 * addon not yet seen, and the rest of the list keeps the order it had.
 */
export function everyAddonRepresented(list: ScoredStream[]): ScoredStream[] {
  const seen = new Set<string>();
  const head: ScoredStream[] = [];
  const rest: ScoredStream[] = [];
  for (const s of list) {
    const key = s.addonId ?? s.addonName ?? "";
    if (seen.has(key)) rest.push(s);
    else {
      seen.add(key);
      head.push(s);
    }
  }
  return head.length > 1 ? [...head, ...rest] : list;
}
