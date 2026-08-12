/**
 * Thin client over the Cinema Box (albox) web API.
 *
 * Endpoint shapes were read off the live service. Nothing here is authenticated
 * — every route answers the same to a bare request as it does to the site, and
 * the video files themselves are plain MP4 served with range support and no
 * token, which is what makes this usable as an ordinary stream source.
 */

const BASE = "https://cinema.albox.co/api/v4";

/** albox's own discriminator, on every card and search result. */
export const TYPE_MOVIE = "MOVIE";
export const TYPE_SERIES = "SERIES";

export type AlboxStyle = {
  image?: string;
  logo?: string;
  background_image?: string;
};

/** A card, as it appears in a row, a search result or a genre listing. */
export type AlboxCard = {
  id: number;
  type?: string;
  title?: string;
  description?: string;
  card_type?: string;
  /** Present on search results and listings; absent inside `dynamic` sections. */
  year?: number;
  category_name?: string;
  style?: AlboxStyle | null;
  /** Runtime in seconds. Non-zero on episodes. */
  length?: number;
  url?: string;
};

export type AlboxSection = {
  id?: number;
  title?: string;
  section_type?: string;
  data?: AlboxCard[];
};

export type AlboxPostInfo = {
  id: number;
  type?: string;
  title?: string;
  description?: string;
  genres?: string[];
  logo?: string;
  image?: string;
  background_image?: string;
  /** Epoch milliseconds, as a string. */
  release_date?: string;
  /** Seconds. Films only. */
  length?: number;
  /** Films only: the id to ask for files with. */
  episode_id?: number;
  /** Series only. */
  current_season_id?: number;
  season_number?: number;
  rating?: { value?: number; age?: string; sources?: Array<{ title?: string; value?: number }> };
};

export type AlboxDynamic = {
  sections?: AlboxSection[];
  post_info?: AlboxPostInfo;
};

export type AlboxVideo = {
  url?: string;
  /** "1080p", "720p", "480p". */
  quality?: string;
};

export type AlboxSubtitle = {
  srt?: string;
  vtt?: string;
  /** "ar", "en", … */
  language?: string;
};

/** Milliseconds into the episode. */
export type AlboxMarks = {
  intro?: { start?: number; end?: number };
  outro?: { start?: number; end?: number };
  /**
   * Ranges the service marks as cut for content reasons, grouped by the level
   * they belong to ("Family watch"). A different promise from an intro: skipping
   * one removes part of the episode.
   */
  levels?: Array<{
    type?: string;
    title?: string;
    cuts?: Array<{ start?: number; end?: number }>;
  }>;
};

export type AlboxEpisodeFiles = {
  id?: number;
  episode_number?: number;
  title?: string;
  image?: string;
  /** Seconds. */
  length?: number;
  videos?: AlboxVideo[];
  subtitles?: AlboxSubtitle[];
  parental_access?: AlboxMarks;
};

/**
 * The files response.
 *
 * The top level carries the requested episode's own files, and `episodes` the
 * whole season with theirs — so one request covers both "play this" and "what
 * else is in this season", which is why the episode list never needs a second
 * round trip.
 */
export type AlboxFiles = {
  videos?: AlboxVideo[];
  subtitles?: AlboxSubtitle[];
  episodes?: AlboxEpisodeFiles[];
};

export type AlboxListing = {
  title?: string;
  results?: AlboxCard[];
  pagination?: { current_page?: number; total_pages?: number };
};

export class AlboxUnavailableError extends Error {
  constructor(status: number) {
    super(`Cinema Box returned ${status}`);
    this.name = "AlboxUnavailableError";
  }
}

/**
 * The app's transport, not the WebView's.
 *
 * Cinema Box answers `Access-Control-Allow-Credentials` and nothing else — no
 * `Allow-Origin` — so a plain `fetch` from the page is rejected before it
 * leaves: measured in the running app, every call failed with "Failed to
 * fetch" and the addon contributed nothing. `safeFetch` leaves through the
 * native HTTP client on Android, where same-origin policy does not apply, and
 * through the proxy on web.
 *
 * Imported at call time because `safe-fetch` imports the local addon registry to
 * dispatch `local://` — the cycle only resolves if this side is late.
 */
async function transport(url: string, init: RequestInit): Promise<Response> {
  const { safeFetch } = await import("@/lib/safe-fetch");
  return safeFetch(url, init);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await transport(`${BASE}${path}`, {
    signal,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });
  const text = await res.text();
  const head = text.trimStart()[0];
  // Unknown routes answer with an Express HTML error page, and a rejected one
  // with a JSON authorization error. Sniffing keeps `JSON.parse` from throwing a
  // syntax error that says nothing about what actually happened.
  if (head !== "[" && head !== "{") throw new AlboxUnavailableError(res.status);
  return JSON.parse(text) as T;
}

/**
 * Title search across films and series.
 *
 * The parameter is `q`. `query` is also accepted, ignored, and answered with a
 * page of unrelated titles — searching for "batman" that way returns a Turkish
 * drama first — so a wrong guess here looks like a working search with terrible
 * results rather than like a mistake.
 */
export function search(query: string, signal?: AbortSignal): Promise<AlboxListing> {
  return getJson<AlboxListing>(`/search?q=${encodeURIComponent(query)}`, signal);
}

/** Everything the detail page knows: post info, seasons, episodes, related. */
export function dynamic(
  id: string | number,
  seasonId?: string | number,
  signal?: AbortSignal,
): Promise<AlboxDynamic> {
  const season = seasonId != null ? `?season=${encodeURIComponent(String(seasonId))}` : "";
  return getJson<AlboxDynamic>(`/shows/shows/dynamic/${id}${season}`, signal);
}

/**
 * Playable files for one episode id.
 *
 * Films have an `episode_id` on their post info and use the same route: to this
 * API a film is a season of one.
 */
export function episodeFiles(
  episodeId: string | number,
  signal?: AbortSignal,
): Promise<AlboxFiles> {
  return getJson<AlboxFiles>(`/shows/episodes/${episodeId}/files`, signal);
}

export function genreListing(
  genreId: string | number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<AlboxListing> {
  return getJson<AlboxListing>(
    `/shows/genres/${genreId}/shows/more?page_number=${page}&page_size=${pageSize}`,
    signal,
  );
}

/** A category or subcategory listing — "أفلام اجنبية", "انمي", and so on. */
export function categoryListing(
  categoryId: string | number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<AlboxListing> {
  return getJson<AlboxListing>(
    `/categories/${categoryId}/shows/more?page_number=${page}&page_size=${pageSize}`,
    signal,
  );
}

export function isSeriesType(type: string | undefined): boolean {
  return String(type).toUpperCase() === TYPE_SERIES;
}

/** `release_date` is epoch milliseconds in a string; the year is what is shown. */
export function yearOf(info: AlboxPostInfo | undefined): number | null {
  if (!info) return null;
  const ms = Number(info.release_date);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const year = new Date(ms).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * A card keeps its artwork under `style`; post info keeps it at the top level.
 * Both shapes reach here, so both are read rather than assuming one.
 */
export function posterOf(card: AlboxCard | AlboxPostInfo | undefined): string | undefined {
  if (!card) return undefined;
  const style = (card as AlboxCard).style;
  if (style) return style.image || style.background_image || undefined;
  const info = card as AlboxPostInfo;
  return info.image || info.background_image || undefined;
}

/** IMDb-style score out of 10. Zero means "not rated", not "rated zero". */
export function ratingOf(info: AlboxPostInfo | undefined): string | undefined {
  const raw = Number(info?.rating?.value);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return String(Math.min(raw, 10));
}

/** Best-resolution-first, so the player's default pick is the good one. */
export function qualityRank(v: AlboxVideo): number {
  const n = parseInt(String(v.quality ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
