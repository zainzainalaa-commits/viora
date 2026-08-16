import type { AddonRow } from "@/lib/addons";

/**
 * Whether an add-on's catalogue is an anime catalogue.
 *
 * The Anime screen is gone, but this outlived it: the home screen uses it to
 * keep anime rows out of the general feed, which is still what the owner wants
 * now that there is no anime section for them to belong to. It moved here from
 * `views/anime/anime-rows.tsx` rather than being deleted with the rest.
 *
 * Three signals, cheapest first: the add-on declares the type, or its name says
 * so, or the identifiers on the titles themselves do — Kitsu, MyAnimeList and
 * AniList all prefix their ids, and half a sample is enough to be sure.
 */
export function isAnimeRow(row: AddonRow): boolean {
  if (row.type === "anime") return true;
  const nameLower = (row.name ?? "").toLowerCase();
  if (/\b(anime|mal|anilist|kitsu|aniworld|crunchyroll|funimation)\b/.test(nameLower)) return true;
  const sample = row.metas.slice(0, 6);
  if (sample.length === 0) return false;
  const animeIds = sample.filter(
    (m) => m.id.startsWith("kitsu:") || m.id.startsWith("mal:") || m.id.startsWith("anilist:"),
  ).length;
  return animeIds / sample.length >= 0.5;
}
