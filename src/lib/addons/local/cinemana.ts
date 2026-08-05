import { getUiLanguage } from "@/lib/i18n/store";
import * as api from "./cinemana-api";
import type { CinemanaItem } from "./cinemana-api";
import type { LocalAddon } from "./types";

/**
 * Cinemana (Shabakaty) as a first-party Stremio addon.
 *
 * It speaks the ordinary addon protocol, so catalogs, meta, streams, subtitles,
 * scoring and the player all treat it exactly like an installed remote addon —
 * nothing downstream knows it runs in-process.
 *
 * Ids are namespaced `cnm:<nb>` so they cannot collide with `tt…` ids from
 * Cinemeta. Where Cinemana knows the IMDb id it is surfaced too, which lets the
 * rest of the app cross-reference the title with its other metadata providers.
 */

const ID_PREFIX = "cnm:";

function toStremioId(nb: string): string {
  return `${ID_PREFIX}${nb}`;
}

function fromStremioId(id: string): string | null {
  if (id.startsWith(ID_PREFIX)) return id.slice(ID_PREFIX.length);
  return null;
}

function arabicUi(): boolean {
  return getUiLanguage() === "ar";
}

function toMeta(item: CinemanaItem, arabic: boolean) {
  const imdb = api.imdbIdFrom(item);
  const series = api.isSeries(item);
  return {
    id: toStremioId(item.nb),
    type: series ? "series" : "movie",
    name: api.titleOf(item, arabic),
    poster: api.posterOf(item),
    background: api.posterOf(item),
    posterShape: "poster",
    description: api.descriptionOf(item, arabic),
    releaseInfo: item.year || undefined,
    imdbRating: api.ratingOf(item),
    runtime: api.runtimeOf(item),
    imdb_id: imdb ?? undefined,
    genres: (item.categories ?? [])
      .map((c) => (typeof c === "string" ? c : arabic ? c.ar_title || c.en_title : c.en_title))
      .filter((g): g is string => !!g),
    trailers: item.trailer ? [{ source: item.trailer, type: "Trailer" }] : undefined,
  };
}

/** Best-resolution-first, so the player's default pick is the good one. */
function resolutionRank(file: api.CinemanaFile): number {
  const n = parseInt(String(file.resolution ?? file.name ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

async function subtitlesFor(item: CinemanaItem, arabic: boolean) {
  const subs: Array<{ id: string; url: string; lang: string }> = [];
  const ar = item.arTranslationFilePath;
  const en = item.enTranslationFilePath;
  if (ar) subs.push({ id: "cnm-ar", url: ar, lang: "ara" });
  if (en) subs.push({ id: "cnm-en", url: en, lang: "eng" });
  // Put the viewer's language first so the player's auto-select lands on it.
  if (arabic) subs.reverse();
  return subs;
}

export const cinemanaAddon: LocalAddon = {
  name: "cinemana",

  manifest: {
    id: "community.cinemana",
    name: "Cinemana",
    version: "1.0.0",
    description:
      "Movies and series from Cinemana (Shabakaty), with Arabic and English subtitles. Streams play directly over HTTP — no torrent or debrid account needed.",
    logo: "https://cinemana.shabakaty.com/favicon.ico",
    types: ["movie", "series"],
    idPrefixes: [ID_PREFIX],
    resources: [
      { name: "catalog", types: ["movie", "series"] },
      { name: "meta", types: ["movie", "series"], idPrefixes: [ID_PREFIX] },
      { name: "stream", types: ["movie", "series"], idPrefixes: [ID_PREFIX] },
      { name: "subtitles", types: ["movie", "series"], idPrefixes: [ID_PREFIX] },
    ],
    catalogs: [
      {
        id: "cinemana-movies",
        type: "movie",
        name: "Cinemana Movies",
        extra: [{ name: "skip" }, { name: "search" }],
      },
      {
        id: "cinemana-series",
        type: "series",
        name: "Cinemana Series",
        extra: [{ name: "skip" }, { name: "search" }],
      },
    ],
    behaviorHints: { adult: false, p2p: false, configurable: false },
  },

  async catalog({ type, extra, signal }) {
    const arabic = arabicUi();
    const query = extra?.search?.trim();
    const kind = type === "series" ? api.KIND_SERIES : api.KIND_MOVIE;

    if (query) {
      const results = await api.search(query, 0, signal);
      const wantSeries = type === "series";
      return {
        metas: results
          .filter((it) => api.isSeries(it) === wantSeries)
          .map((it) => toMeta(it, arabic)),
      };
    }

    // `skip` counts items; Cinemana pages by number and is 1-based.
    const perPage = 30;
    const skip = Number(extra?.skip ?? 0);
    const page = Math.floor((Number.isFinite(skip) ? skip : 0) / perPage) + 1;
    const items = await api.browse({ kind, page, perPage }, signal);
    return { metas: items.map((it) => toMeta(it, arabic)) };
  },

  async meta({ id, signal }) {
    const nb = fromStremioId(id);
    if (!nb) return { meta: null };
    const arabic = arabicUi();
    const item = await api.videoInfo(nb, signal);
    const meta = toMeta(item, arabic) as ReturnType<typeof toMeta> & {
      videos?: Array<Record<string, unknown>>;
    };

    if (api.isSeries(item)) {
      const episodes = await api.seasonEpisodes(api.rootIdOf(item), signal).catch(() => []);
      const seriesTitle = api.titleOf(item, arabic);
      meta.videos = episodes.map((ep) => {
        const season = Number(ep.season) || 1;
        const number = Number(ep.episodeNummer) || 0;
        // Cinemana repeats the series title on every episode, which would give
        // an episode list where each row reads the same. Fall back to the
        // number whenever the title carries no episode-specific information.
        const raw = api.titleOf(ep, arabic);
        const label = raw && raw !== seriesTitle ? raw : `Episode ${number}`;
        return {
          id: toStremioId(ep.nb),
          season,
          episode: number,
          number,
          title: label,
          name: label,
          released: ep.publishDate || undefined,
          thumbnail: api.posterOf(ep) ?? api.posterOf(item),
          overview: api.descriptionOf(ep, arabic),
        };
      });
    }
    return { meta };
  },

  async stream({ id, signal }) {
    const nb = fromStremioId(id);
    if (!nb) return { streams: [] };
    const arabic = arabicUi();
    const [files, item] = await Promise.all([
      api.transcodedFiles(nb, signal),
      api.videoInfo(nb, signal).catch(() => null),
    ]);
    const subtitles = item ? await subtitlesFor(item, arabic) : [];

    const streams = files
      .filter((f) => !!f.videoUrl)
      .sort((a, b) => resolutionRank(b) - resolutionRank(a))
      .map((f) => {
        const label = f.resolution || f.name || "auto";
        return {
          name: "Cinemana",
          title: `${label}${f.container ? ` · ${f.container.toUpperCase()}` : ""}`,
          url: f.videoUrl,
          subtitles: subtitles.length ? subtitles : undefined,
          behaviorHints: {
            // Pre-transcoded MP4 over HTTP: the HTML5 engine plays it directly,
            // which is what makes this source work on Android where mpv is absent.
            notWebReady: false,
            bingeGroup: `cinemana-${label}`,
            filename: f.transcoddedFileName,
          },
        };
      });
    return { streams };
  },

  async subtitles({ id, signal }) {
    const nb = fromStremioId(id);
    if (!nb) return { subtitles: [] };
    const item = await api.videoInfo(nb, signal).catch(() => null);
    if (!item) return { subtitles: [] };
    return { subtitles: await subtitlesFor(item, arabicUi()) };
  },
};
