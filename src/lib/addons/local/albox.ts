import * as api from "./albox-api";
import type { AlboxCard, AlboxEpisodeFiles, AlboxFiles } from "./albox-api";
import { resolveToAlbox, type AlboxTarget } from "./albox-resolve";
import type { LocalAddon } from "./types";

/**
 * Cinema Box (albox) as a first-party Stremio addon.
 *
 * It speaks the ordinary addon protocol, so catalogs, meta, streams, subtitles,
 * scoring and the player all treat it exactly like an installed remote addon —
 * nothing downstream knows it runs in-process.
 *
 * Ids are namespaced `abx:` so they cannot collide with `tt…` ids from Cinemeta:
 * `abx:<showId>` names a film or a show, `abx:<showId>:<episodeId>` one episode.
 * Both halves are carried because the files endpoint is keyed on the episode
 * while every label the viewer reads comes from the show.
 *
 * Unlike Cinemana there is no IMDb id anywhere in this service, so answering for
 * a `tt…` id goes through a title-and-year match — see `albox-resolve`.
 */

const ID_PREFIX = "abx:";

/** Categories, from `/categories/more`. Films are one; everything else is a show. */
const CAT_MOVIES = 18;
const CAT_SERIES = 20;
const CAT_TV = 9;
const CAT_ANIME = 8;
const CAT_CARTOON = 39;

const PAGE_SIZE = 30;

type LocalId =
  | { kind: "show"; showId: number }
  | { kind: "episode"; showId: number; episodeId: number; season: number | null };

/**
 * `abx:<showId>`, or `abx:<showId>:<episodeId>:<season>` for an episode.
 *
 * The season number rides along because nothing in the files response carries
 * it — that response is a season's worth of episodes with no statement of which
 * season it is — and the alternative is walking every season of the show to
 * find out, on the way to naming a file.
 */
function parseLocalId(id: string): LocalId | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const parts = id.slice(ID_PREFIX.length).split(":");
  const showId = Number(parts[0]);
  if (!Number.isFinite(showId)) return null;
  if (parts.length === 1) return { kind: "show", showId };
  const episodeId = Number(parts[1]);
  if (!Number.isFinite(episodeId)) return null;
  const season = Number(parts[2]);
  return { kind: "episode", showId, episodeId, season: Number.isFinite(season) ? season : null };
}

function showIdOf(showId: number): string {
  return `${ID_PREFIX}${showId}`;
}

function episodeIdOf(showId: number, episodeId: number, season: number): string {
  return `${ID_PREFIX}${showId}:${episodeId}:${season}`;
}

/** A listing card carries everything a catalogue row needs, so it costs no lookup. */
function cardToMeta(card: AlboxCard) {
  const series = api.isSeriesType(card.type);
  return {
    id: showIdOf(card.id),
    type: series ? "series" : "movie",
    name: card.title ?? "",
    poster: api.posterOf(card),
    background: card.style?.background_image || api.posterOf(card),
    posterShape: "poster",
    description: card.description || undefined,
    releaseInfo: card.year ? String(card.year) : undefined,
  };
}

/**
 * A release-style filename, because the pipeline reads one.
 *
 * Cinema Box names its files after the CDN object — `3ea90e51-….mp4` — and the
 * stream parser is built for torrent releases, so it would read that GUID as the
 * title of the film and then discard every rendition for not matching the title
 * being opened. This is the same trap Cinemana hit, and the same answer: give
 * the stream a name that says what it is.
 */
function releaseFilename(
  title: string,
  quality: string | undefined,
  opts: { year?: number | null; season?: number; episode?: number },
): string {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const res = quality ? ` ${quality}` : "";
  if (opts.season != null && opts.episode != null) {
    const tag = `S${String(opts.season).padStart(2, "0")}E${String(opts.episode).padStart(2, "0")}`;
    return `${clean} ${tag}${res}.mp4`;
  }
  const year = opts.year ? ` (${opts.year})` : "";
  return `${clean}${year}${res}.mp4`;
}

const SUBTITLE_LANGS: Record<string, string> = {
  ar: "ara",
  ara: "ara",
  en: "eng",
  eng: "eng",
  fr: "fra",
  tr: "tur",
};

/**
 * Subtitle tracks for one episode's file set.
 *
 * Each track is published as both .srt and .vtt. VTT is preferred: it is what
 * the player renders without a conversion step, and the two are the same track.
 */
function subtitlesFrom(files: Pick<AlboxFiles, "subtitles">): Array<{
  id: string;
  url: string;
  lang: string;
}> {
  const best = new Map<string, string>();
  for (const entry of files.subtitles ?? []) {
    const lang = SUBTITLE_LANGS[String(entry.language ?? "").toLowerCase()] ?? "ara";
    const url = entry.vtt || entry.srt;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (!best.has(lang)) best.set(lang, url);
  }
  return [...best].map(([lang, url]) => ({ id: `abx-${lang}`, url, lang }));
}

/** The episode inside a file set that the request was actually about. */
function episodeIn(files: AlboxFiles, episodeId: number): AlboxEpisodeFiles | undefined {
  return (files.episodes ?? []).find((e) => Number(e.id) === episodeId);
}

/**
 * One page of a category, as metas of the catalogue's own type.
 *
 * The filter is not cosmetic: "برامج تلفزيون" holds documentaries alongside its
 * programmes, so the category answers with both MOVIE and SERIES rows. A meta
 * whose type disagrees with the catalogue it arrived in is a row the detail page
 * then opens as the wrong kind of thing.
 */
async function listing(
  categoryId: number,
  type: string,
  skip: number,
  signal?: AbortSignal,
): Promise<{ metas: unknown[] }> {
  const page = Math.floor((Number.isFinite(skip) ? skip : 0) / PAGE_SIZE) + 1;
  const data = await api.categoryListing(categoryId, page, PAGE_SIZE, signal);
  const wantSeries = type === "series";
  return {
    metas: (data.results ?? [])
      .filter((r) => api.isSeriesType(r.type) === wantSeries)
      .map(cardToMeta),
  };
}

export const alboxAddon: LocalAddon = {
  name: "albox",

  manifest: {
    id: "community.albox",
    name: "Cinema Box",
    version: "1.0.0",
    description:
      "Movies, series, anime and TV from Cinema Box, with Arabic subtitles. Streams are direct MP4 over HTTP — no torrent or debrid account needed.",
    logo: "https://cinema.albox.co/favicon.ico",
    types: ["movie", "series"],
    idPrefixes: [ID_PREFIX],
    resources: [
      { name: "catalog", types: ["movie", "series"] },
      { name: "meta", types: ["movie", "series"], idPrefixes: [ID_PREFIX] },
      // `tt` alongside its own prefix is what makes this a source for the whole
      // library rather than only for its own catalogue rows. The stream pipeline
      // reads these per-resource prefixes to decide who to ask, so without `tt`
      // here it would never be queried for a title opened from Cinemeta.
      //
      // Meta stays `abx:` only on purpose: Cinema Box should supply streams for
      // another provider's title, not claim to describe it.
      { name: "stream", types: ["movie", "series"], idPrefixes: [ID_PREFIX, "tt"] },
      { name: "subtitles", types: ["movie", "series"], idPrefixes: [ID_PREFIX, "tt"] },
    ],
    catalogs: [
      {
        id: "albox-movies",
        type: "movie",
        name: "Cinema Box Movies",
        extra: [{ name: "skip" }, { name: "search" }],
      },
      {
        id: "albox-series",
        type: "series",
        name: "Cinema Box Series",
        extra: [{ name: "skip" }, { name: "search" }],
      },
      { id: "albox-anime", type: "series", name: "Cinema Box Anime", extra: [{ name: "skip" }] },
      { id: "albox-cartoon", type: "series", name: "Cinema Box Cartoon", extra: [{ name: "skip" }] },
      { id: "albox-tv", type: "series", name: "Cinema Box TV", extra: [{ name: "skip" }] },
    ],
    behaviorHints: { adult: false, p2p: false, configurable: false },
  },

  async catalog({ type, id, extra, signal }) {
    const query = extra?.search?.trim();
    const skip = Number(extra?.skip ?? 0);

    if (query) {
      const wantSeries = type === "series";
      const data = await api.search(query, signal);
      return {
        metas: (data.results ?? [])
          .filter((r) => api.isSeriesType(r.type) === wantSeries)
          .map(cardToMeta),
      };
    }

    switch (id) {
      case "albox-anime":
        return listing(CAT_ANIME, type, skip, signal);
      case "albox-cartoon":
        return listing(CAT_CARTOON, type, skip, signal);
      case "albox-tv":
        return listing(CAT_TV, type, skip, signal);
      default:
        return listing(type === "series" ? CAT_SERIES : CAT_MOVIES, type, skip, signal);
    }
  },

  async meta({ id, signal }) {
    const local = parseLocalId(id);
    if (!local) return { meta: null };

    const dyn = await api.dynamic(local.showId, undefined, signal);
    const info = dyn.post_info;
    if (!info) return { meta: null };

    const series = api.isSeriesType(info.type);
    const year = api.yearOf(info);
    const meta: Record<string, unknown> = {
      id: showIdOf(local.showId),
      type: series ? "series" : "movie",
      name: info.title ?? "",
      poster: api.posterOf(info),
      background: info.background_image || api.posterOf(info),
      logo: info.logo || undefined,
      posterShape: "poster",
      description: info.description || undefined,
      releaseInfo: year ? String(year) : undefined,
      imdbRating: api.ratingOf(info),
      runtime: info.length ? `${Math.round(info.length / 60)} min` : undefined,
      genres: info.genres ?? undefined,
    };

    if (series) {
      // Every season, not just the one the service opens on: the episode list is
      // the whole point of a series page, and each extra season is one request.
      const seasons =
        dyn.sections?.find((s) => (s.data ?? []).some((d) => d.type === "season"))?.data ?? [];
      const current = Number(info.season_number);
      const videos: Array<Record<string, unknown>> = [];

      const collect = (from: api.AlboxDynamic, seasonNumber: number) => {
        const episodes =
          from.sections?.find((s) => (s.data ?? []).some((d) => d.type === "episode"))?.data ?? [];
        episodes.forEach((ep, index) => {
          const numbered = Number(String(ep.title ?? "").replace(/\D+/g, ""));
          const number = Number.isFinite(numbered) && numbered > 0 ? numbered : index + 1;
          videos.push({
            id: episodeIdOf(local.showId, ep.id, seasonNumber),
            season: seasonNumber,
            episode: number,
            number,
            title: ep.title || `Episode ${number}`,
            name: ep.title || `Episode ${number}`,
            thumbnail: api.posterOf(ep) ?? api.posterOf(info),
            overview: ep.description || undefined,
          });
        });
      };

      collect(dyn, Number.isFinite(current) && current > 0 ? current : 1);
      for (const season of seasons) {
        const number = Number(String(season.title ?? "").trim());
        if (!Number.isFinite(number) || number === current) continue;
        // One bad season should cost that season, not the whole page.
        const other = await api.dynamic(local.showId, season.id, signal).catch(() => null);
        if (other) collect(other, number);
      }

      videos.sort((a, b) =>
        Number(a.season) - Number(b.season) || Number(a.episode) - Number(b.episode));
      meta.videos = videos;
    }

    return { meta };
  },

  async stream({ id, signal }) {
    let target: AlboxTarget | null = null;
    const local = parseLocalId(id);

    if (local?.kind === "episode") {
      target = {
        showId: local.showId,
        episodeId: local.episodeId,
        season: local.season ?? undefined,
      };
    } else if (local?.kind === "show") {
      // A film keeps its playable id on the post info; a show opened without an
      // episode has nothing to play.
      const dyn = await api.dynamic(local.showId, undefined, signal);
      const episodeId = dyn.post_info?.episode_id;
      if (!episodeId) return { streams: [] };
      target = {
        showId: local.showId,
        episodeId,
        title: dyn.post_info?.title,
        year: api.yearOf(dyn.post_info),
      };
    } else {
      target = await resolveToAlbox(id, signal);
    }
    if (!target) return { streams: [] };

    const files = await api.episodeFiles(target.episodeId, signal);
    const episode = episodeIn(files, target.episodeId);
    // The top level is the requested episode's own file set; `episodes` is the
    // rest of the season. Either can be the one carrying the videos.
    const videos = (files.videos?.length ? files.videos : episode?.videos) ?? [];
    const subtitles = subtitlesFrom(
      files.subtitles?.length ? files : { subtitles: episode?.subtitles },
    );

    // A title is needed for the filename, and a `tt` id was resolved from a
    // title we already know. Only a bare `abx:` episode has to go and ask.
    let title = target.title;
    if (!title && local?.kind === "episode") {
      const dyn = await api.dynamic(target.showId, undefined, signal).catch(() => null);
      title = dyn?.post_info?.title;
      target.year = api.yearOf(dyn?.post_info);
    }

    const season = target.season;
    const episodeNumber = target.episode ?? episode?.episode_number ?? undefined;

    const streams = videos
      .filter((v) => !!v.url)
      .sort((a, b) => api.qualityRank(b) - api.qualityRank(a))
      .map((v) => {
        const label = v.quality || "auto";
        return {
          name: "Cinema Box",
          title: `${label} · MP4`,
          url: v.url,
          subtitles: subtitles.length ? subtitles : undefined,
          behaviorHints: {
            // Progressive MP4 over HTTP with range support and no token: both
            // engines play it directly.
            notWebReady: false,
            bingeGroup: `albox-${label}`,
            filename: releaseFilename(title ?? "Cinema Box", v.quality, {
              year: target.year,
              season,
              episode: episodeNumber,
            }),
          },
        };
      });
    return { streams };
  },

  async subtitles({ id, signal }) {
    const local = parseLocalId(id);
    let episodeId: number | null = null;

    if (local?.kind === "episode") episodeId = local.episodeId;
    else if (local?.kind === "show") {
      const dyn = await api.dynamic(local.showId, undefined, signal);
      episodeId = dyn.post_info?.episode_id ?? null;
    } else {
      episodeId = (await resolveToAlbox(id, signal))?.episodeId ?? null;
    }
    if (episodeId == null) return { subtitles: [] };

    const files = await api.episodeFiles(episodeId, signal);
    const episode = episodeIn(files, episodeId);
    return {
      subtitles: subtitlesFrom(
        files.subtitles?.length ? files : { subtitles: episode?.subtitles },
      ),
    };
  },
};
