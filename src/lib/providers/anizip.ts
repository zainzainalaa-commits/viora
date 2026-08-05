const ENDPOINT = "https://api.ani.zip/mappings";
const cache = new Map<string, AniZipMapping | null>();
const inflight = new Map<string, Promise<AniZipMapping | null>>();

export type AniZipEpisode = {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  tvdbShowId?: number;
  tvdbId?: number;
  anidbEid?: number;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  overview?: string;
  image?: string;
  rating?: string;
  finaleType?: string;
  filler?: boolean;
  titles?: Record<string, string>;
};

export type AniZipMapping = {
  titles?: Record<string, string>;
  episodes?: Record<string, AniZipEpisode>;
  mappings?: {
    anilist_id?: number;
    kitsu_id?: number;
    mal_id?: number;
    anidb_id?: number;
    thetvdb_id?: number;
    themoviedb_id?: number;
    imdb_id?: string;
  };
};

export async function aniZipByKitsu(kitsuId: number): Promise<AniZipMapping | null> {
  return get(`kitsu_id=${kitsuId}`);
}

export async function aniZipByAnilist(anilistId: number): Promise<AniZipMapping | null> {
  return get(`anilist_id=${anilistId}`);
}

export async function aniZipByMal(malId: number): Promise<AniZipMapping | null> {
  return get(`mal_id=${malId}`);
}

export async function aniZipByAnidb(anidbId: number): Promise<AniZipMapping | null> {
  return get(`anidb_id=${anidbId}`);
}

export async function aniZipByImdb(imdbId: string): Promise<AniZipMapping | null> {
  return get(`imdb_id=${imdbId}`);
}

export async function aniZipByTmdbTv(tmdbId: number): Promise<AniZipMapping | null> {
  return get(`themoviedb_id=${tmdbId}`);
}

const TIMEOUT_MS = 4000;

async function get(query: string): Promise<AniZipMapping | null> {
  if (cache.has(query)) return cache.get(query) ?? null;
  const existing = inflight.get(query);
  if (existing) return existing;
  const p = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}?${query}`, { signal: ac.signal });
      if (!res.ok) {
        cache.set(query, null);
        return null;
      }
      const json = (await res.json()) as AniZipMapping;
      cache.set(query, json);
      return json;
    } catch {
      cache.set(query, null);
      return null;
    } finally {
      clearTimeout(timer);
      inflight.delete(query);
    }
  })();
  inflight.set(query, p);
  return p;
}

export function pickEpisodeTitle(ep: AniZipEpisode | undefined): string | null {
  if (!ep?.titles) return null;
  return ep.titles.en ?? ep.titles["x-jat"] ?? ep.titles.ja ?? null;
}
