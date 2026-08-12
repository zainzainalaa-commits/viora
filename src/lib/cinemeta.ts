import { safeFetch as fetch } from "@/lib/safe-fetch";

const CINEMETA = "https://v3-cinemeta.strem.io";

export type MetaType = "movie" | "series" | "channel" | "tv" | "anime" | "other";

export function narrowMediaType(t: MetaType | string | undefined): "movie" | "series" {
  return t === "series" ? "series" : "movie";
}

export type Meta = {
  id: string;
  type: MetaType;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  originalLanguage?: string;
  releaseInfo?: string;
  releaseDate?: string;
  inTheaters?: boolean;
  imdbRating?: string;
  runtime?: string;
  genres?: string[];
  trailers?: Array<{ source: string; type?: string }>;
  trailerStreams?: Array<{ ytId?: string; title?: string }>;
  links?: Array<{ name: string; category: string; url: string }>;
  addonOrigin?: { id: string; name: string; logo?: string; base?: string };
  behaviorHints?: { defaultVideoId?: string | null };
  videos?: Array<{
    id?: string;
    season?: number;
    episode?: number;
    number?: number;
    released?: string;
    firstAired?: string;
    name?: string;
    title?: string;
    overview?: string;
    description?: string;
    thumbnail?: string;
    streams?: Array<Record<string, unknown>>;
  }>;
};

export function isAddonNativeMeta(meta: Meta): boolean {
  if (meta.type === "tv" || meta.type === "channel") return true;
  if (!meta.addonOrigin) return false;
  const id = meta.id || "";
  const resolvable =
    /^tt\d/.test(id) ||
    id.startsWith("tmdb:") ||
    id.startsWith("kitsu:") ||
    id.startsWith("mal:");
  return !resolvable;
}

/**
 * Catalogues are fetched once and kept.
 *
 * Opening a section asks for every row it shows at the same instant — fourteen
 * of them on Movies, all to the same host, and none of them was remembered for
 * even a second. Measured on the device: the burst leaves within 23ms of itself
 * and the slowest replies land thirteen seconds later, because a browser will
 * only hold a few connections to one origin and the rest queue behind them. Go
 * back to the section a minute later and every one of them is asked again.
 *
 * Three things fix that, and they are all here. The answer is held in memory for
 * an hour, since a "top movies" list does not change while somebody is using the
 * app. A second row asking for a catalogue already in flight waits on the same
 * request instead of starting another. And the result is written to storage, so
 * the section is instant on the next launch rather than only the next visit.
 *
 * What is stored is trimmed: a catalogue answer runs to hundreds of kilobytes
 * and storage is a few megabytes in total, so only the fields a card actually
 * draws are kept, and only as many entries as a row can show.
 */
const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_KEEP = 60;
// Versioned, so a change to what is stored retires what was stored before it.
// The first release of this cache kept a trimmed meta and broke the heroes; a
// device that had already written those entries would have gone on serving them
// for an hour after the fix. Bumping the name is what makes a format change take
// effect immediately instead of eventually.
const CATALOG_PREFIX = "viora.catalog.v2.";

const catalogMemory = new Map<string, { at: number; metas: Meta[] }>();
const catalogInflight = new Map<string, Promise<Meta[]>>();

function readStoredCatalog(path: string): Meta[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_PREFIX + path);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; metas?: Meta[] };
    if (!parsed?.at || !Array.isArray(parsed.metas)) return null;
    if (Date.now() - parsed.at > CATALOG_TTL_MS) {
      localStorage.removeItem(CATALOG_PREFIX + path);
      return null;
    }
    return parsed.metas;
  } catch {
    return null;
  }
}

function writeStoredCatalog(path: string, metas: Meta[]): void {
  try {
    // Fewer entries, whole entries.
    //
    // The first version of this kept only the handful of fields a poster draws,
    // and that quietly emptied both hero carousels: a hero is built by filtering
    // the same catalogue for items that have a `background`, and the stored copy
    // had none, so every screen served from storage showed a hero-shaped hole.
    // A catalogue meta is a couple of kilobytes, so sixty of them across a dozen
    // catalogues is comfortably inside the storage budget — there is nothing to
    // buy by guessing which fields the rest of the app will want.
    const kept = metas.slice(0, CATALOG_KEEP);
    localStorage.setItem(CATALOG_PREFIX + path, JSON.stringify({ at: Date.now(), metas: kept }));
  } catch {
    // Storage full or unavailable: the memory cache still does its job.
  }
}

async function catalog(path: string): Promise<Meta[]> {
  const hit = catalogMemory.get(path);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.metas;

  const shared = catalogInflight.get(path);
  if (shared) return shared;

  const stored = readStoredCatalog(path);
  if (stored) {
    catalogMemory.set(path, { at: Date.now(), metas: stored });
    return stored;
  }

  const request = (async () => {
    try {
      const res = await fetch(`${CINEMETA}/catalog/${path}.json`);
      if (!res.ok) return [];
      const json = await res.json();
      const metas: Meta[] = json.metas ?? [];
      if (metas.length > 0) {
        catalogMemory.set(path, { at: Date.now(), metas });
        writeStoredCatalog(path, metas);
      }
      return metas;
    } catch {
      return [];
    } finally {
      catalogInflight.delete(path);
    }
  })();
  catalogInflight.set(path, request);
  return request;
}

function cinemetaTopPath(type: "movie" | "series", genre?: string, skip = 0): string {
  const parts = [`${type}/top`];
  if (genre) parts.push(`genre=${encodeURIComponent(genre)}`);
  if (skip > 0) parts.push(`skip=${skip}`);
  return parts.join("/");
}

export const topMovies = (genre?: string, skip = 0) =>
  catalog(cinemetaTopPath("movie", genre, skip));

export const topSeries = (genre?: string, skip = 0) =>
  catalog(cinemetaTopPath("series", genre, skip));

export async function meta(
  type: "movie" | "series",
  id: string,
  signal?: AbortSignal,
): Promise<Meta | null> {
  const res = await fetch(`${CINEMETA}/meta/${type}/${id}.json`, signal ? { signal } : undefined);
  if (!res.ok) return null;
  const json = await res.json();
  return json.meta ?? null;
}
