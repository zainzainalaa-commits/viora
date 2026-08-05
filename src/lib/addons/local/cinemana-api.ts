/**
 * Thin client over the Cinemana (Shabakaty) Android API.
 *
 * Endpoint shapes were confirmed against the live service; the browse endpoint
 * intermittently answers 500 with an HTML maintenance page, so every response
 * is content-sniffed before parsing rather than trusted to be JSON.
 */

const BASE = "https://cinemana.shabakaty.com/api/android";

/** Cinemana's own `kind` discriminator. */
export const KIND_MOVIE = "1";
export const KIND_SERIES = "2";

export type CinemanaItem = {
  nb: string;
  en_title?: string;
  ar_title?: string;
  en_content?: string;
  ar_content?: string;
  year?: string;
  /** Seconds, as a stringified float. */
  duration?: string;
  /** IMDb-style score out of 10, as a string. */
  stars?: string;
  kind?: string;
  season?: string;
  episodeNummer?: string;
  /** "0" on a standalone item; otherwise the parent series id. */
  rootSeries?: string;
  imgObjUrl?: string;
  imgMediumThumbObjUrl?: string;
  imgThumbObjUrl?: string;
  /** e.g. https://www.imdb.com/title/tt5775220/ */
  imdbUrlRef?: string;
  trailer?: string;
  publishDate?: string;
  arTranslationFilePath?: string;
  enTranslationFilePath?: string;
  categories?: Array<{ en_title?: string; ar_title?: string } | string>;
};

export type CinemanaFile = {
  name?: string;
  resolution?: string;
  container?: string;
  videoUrl?: string;
  transcoddedFileName?: string;
};

export class CinemanaUnavailableError extends Error {
  constructor(status: number) {
    super(`Cinemana returned ${status}`);
    this.name = "CinemanaUnavailableError";
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });
  const text = await res.text();
  const head = text.trimStart()[0];
  // The maintenance page is served with a 500 and an HTML body; JSON.parse on
  // that throws a syntax error that says nothing useful.
  if (head !== "[" && head !== "{") throw new CinemanaUnavailableError(res.status);
  return JSON.parse(text) as T;
}

export function browse(
  opts: { kind: string; page?: number; perPage?: number; sort?: string; level?: number },
  signal?: AbortSignal,
): Promise<CinemanaItem[]> {
  const perPage = opts.perPage ?? 30;
  const level = opts.level ?? 0;
  const sort = opts.sort ?? "desc";
  const page = opts.page ?? 1;
  return getJson<CinemanaItem[]>(
    `${BASE}/video/V/2/itemsPerPage/${perPage}/level/${level}/videoKind/${opts.kind}/sortParam/${sort}/pageNumber/${page}`,
    signal,
  );
}

export function search(query: string, page = 0, signal?: AbortSignal): Promise<CinemanaItem[]> {
  const params = new URLSearchParams({ videoTitle: query, page: String(page) });
  return getJson<CinemanaItem[]>(`${BASE}/AdvancedSearch?${params}`, signal);
}

export function videoInfo(id: string, signal?: AbortSignal): Promise<CinemanaItem> {
  return getJson<CinemanaItem>(`${BASE}/allVideoInfo/id/${id}`, signal);
}

/** Episodes of a series. Answers `[]` when given a standalone movie id. */
export function seasonEpisodes(rootId: string, signal?: AbortSignal): Promise<CinemanaItem[]> {
  return getJson<CinemanaItem[]>(`${BASE}/videoSeason/id/${rootId}`, signal);
}

/** Pre-transcoded renditions. URLs are signed and expire, so never cache them. */
export function transcodedFiles(id: string, signal?: AbortSignal): Promise<CinemanaFile[]> {
  return getJson<CinemanaFile[]>(`${BASE}/transcoddedFiles/id/${id}`, signal);
}

/** `https://www.imdb.com/title/tt123/` -> `tt123`. */
export function imdbIdFrom(item: CinemanaItem): string | null {
  const m = /\/title\/(tt\d+)/.exec(item.imdbUrlRef ?? "");
  return m ? m[1] : null;
}

export function isSeries(item: CinemanaItem): boolean {
  return String(item.kind) === KIND_SERIES;
}

/** The id that owns the episode list: the parent for episodes, self otherwise. */
export function rootIdOf(item: CinemanaItem): string {
  const root = item.rootSeries;
  return root && root !== "0" ? root : item.nb;
}

export function titleOf(item: CinemanaItem, arabic: boolean): string {
  const en = item.en_title?.trim();
  const ar = item.ar_title?.trim();
  return (arabic ? ar || en : en || ar) ?? "";
}

export function descriptionOf(item: CinemanaItem, arabic: boolean): string {
  const en = item.en_content?.trim();
  const ar = item.ar_content?.trim();
  return (arabic ? ar || en : en || ar) ?? "";
}

export function posterOf(item: CinemanaItem): string | undefined {
  return item.imgObjUrl || item.imgMediumThumbObjUrl || item.imgThumbObjUrl || undefined;
}

/**
 * `stars` is already an IMDb-style score out of 10 despite the field name —
 * Inception comes back as 8.8, not 4.4. Values above 10 are clamped rather than
 * trusted, since a bad record would otherwise render as a nonsense rating.
 */
export function ratingOf(item: CinemanaItem): string | undefined {
  const raw = Number(item.stars);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.min(raw, 10).toFixed(1);
}

export function runtimeOf(item: CinemanaItem): string | undefined {
  const secs = Number(item.duration);
  if (!Number.isFinite(secs) || secs <= 0) return undefined;
  return `${Math.round(secs / 60)} min`;
}
