import * as api from "./albox-api";
import type { AlboxCard } from "./albox-api";

/**
 * Finding a Cinema Box title from an id that did not come from Cinema Box.
 *
 * This is what makes the addon a source for the whole library rather than only
 * for its own catalogue rows: open a film from Cinemeta and the stream pipeline
 * asks with a `tt…` id, which means nothing here until it is translated.
 *
 * Where this differs from Cinemana
 * --------------------------------
 * Cinemana publishes `imdbUrlRef` on every record, so a candidate can be
 * confirmed against the id being asked for. Cinema Box publishes no IMDb id at
 * all — only a rating value labelled "IMDb" — so that confirmation is not
 * available and the match has to be carried by title, year and kind.
 *
 * The search endpoint does return the year and the kind on every result, which
 * is what keeps this to a single request. The rules below are deliberately
 * strict, because the failure being avoided is not "no source found", it is
 * playing a different film with the same name: a search for "Batman" answers
 * with nine of them across four decades.
 */

const HIT_TTL_MS = 6 * 60 * 60 * 1000;
// Misses expire quickly: a title absent today may be added tomorrow, and the
// alternative is caching "not here" for a whole session.
const MISS_TTL_MS = 30 * 60 * 1000;

/** Resolved ids: `episode` is what the files endpoint takes. */
export type AlboxTarget = {
  showId: number;
  episodeId: number;
  /** Present for episodes, so a stream can name itself SxxEyy. */
  season?: number;
  episode?: number;
  title?: string;
  year?: number | null;
};

const cache = new Map<string, { at: number; target: AlboxTarget | null }>();

type ForeignId =
  | { kind: "movie"; imdb: string }
  | { kind: "episode"; imdb: string; season: number; episode: number };

/** `tt123` for a film, `tt123:2:5` for season 2 episode 5 of a series. */
function parseForeignId(id: string): ForeignId | null {
  const m = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);
  if (!m) return null;
  if (m[2] != null && m[3] != null) {
    return { kind: "episode", imdb: m[1], season: Number(m[2]), episode: Number(m[3]) };
  }
  return { kind: "movie", imdb: m[1] };
}

/**
 * Title text reduced to what two catalogues can be expected to agree on.
 *
 * Cinema Box writes "Spider Man 3" where Cinemeta writes "Spider-Man 3", and
 * Arabic titles arrive as "Eşref Rüya - حلم اشرف" with both names in one field.
 * Punctuation and case therefore cannot be part of the comparison.
 */
function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

/** "Eşref Rüya - حلم اشرف" also has to match on either half alone. */
function variants(title: string): string[] {
  const whole = normalize(title);
  const parts = title
    .split(/\s+[-–—|]\s+/)
    .map(normalize)
    .filter((p) => p.length > 1);
  return [whole, ...parts].filter(Boolean);
}

async function titleFor(
  type: "movie" | "series",
  imdb: string,
  signal?: AbortSignal,
): Promise<{ name: string; year: number | null } | null> {
  // Imported at call time to break a cycle: cinemeta reaches the network through
  // safeFetch, and safeFetch is what dispatches `local://` back into this addon.
  const { meta } = await import("@/lib/cinemeta");
  // Deliberately uncaught. `meta` answers null when Cinemeta genuinely has no
  // record, which is a real answer and a legitimate miss; a rejection means the
  // lookup did not happen, and the two must not end up looking the same.
  const m = await meta(type, imdb, signal);
  if (!m?.name) return null;
  const year = parseInt(String(m.releaseInfo ?? m.releaseDate ?? "").slice(0, 4), 10);
  return { name: m.name, year: Number.isFinite(year) ? year : null };
}

/**
 * Picks the record that is genuinely the same title, or nothing.
 *
 * Without an id to confirm against, the year is doing the work the IMDb check
 * does for Cinemana, so a candidate whose year is unknown or wrong is refused
 * rather than guessed at. One year of slack absorbs the ordinary disagreement
 * between a festival date and a wide release; a series is allowed more, because
 * Cinemeta dates a show by its first episode and Cinema Box sometimes dates it
 * by the season it carries.
 */
function pickMatch(
  results: AlboxCard[],
  want: { name: string; year: number | null; series: boolean },
): AlboxCard | null {
  const sameKind = results.filter((r) => api.isSeriesType(r.type) === want.series);
  const targets = variants(want.name);
  const named = sameKind.filter((r) =>
    variants(String(r.title ?? "")).some((v) => targets.includes(v)),
  );
  if (named.length === 0) return null;

  if (want.year == null) {
    // No year to check against: only an unambiguous answer is safe to follow.
    return named.length === 1 ? named[0] : null;
  }

  const slack = want.series ? 2 : 1;
  const dated = named
    .filter((r) => Number.isFinite(Number(r.year)))
    .map((r) => ({ r, off: Math.abs(Number(r.year) - (want.year as number)) }))
    .filter((c) => c.off <= slack)
    .sort((a, b) => a.off - b.off);
  return dated[0]?.r ?? null;
}

async function findShow(
  imdb: string,
  series: boolean,
  signal?: AbortSignal,
): Promise<AlboxCard | null> {
  const info = await titleFor(series ? "series" : "movie", imdb, signal);
  if (!info) return null;
  const listing = await api.search(info.name, signal);
  const results = listing.results ?? [];
  if (results.length === 0) return null;
  return pickMatch(results, { name: info.name, year: info.year, series });
}

/** The season id Cinema Box uses for a given season number, if it has one. */
function seasonIdFor(dyn: api.AlboxDynamic, wanted: number): number | null {
  const seasons =
    dyn.sections?.find((s) => (s.data ?? []).some((d) => d.type === "season"))?.data ?? [];
  for (const s of seasons) {
    // The season's number is its title — "1", "2" — not its id.
    if (Number(String(s.title ?? "").trim()) === wanted) return s.id;
  }
  return null;
}

/** The episodes carried by a dynamic response, whichever section holds them. */
function episodesOf(dyn: api.AlboxDynamic): AlboxCard[] {
  return dyn.sections?.find((s) => (s.data ?? []).some((d) => d.type === "episode"))?.data ?? [];
}

async function resolveUncached(
  id: string,
  signal?: AbortSignal,
): Promise<AlboxTarget | null> {
  const parsed = parseForeignId(id);
  if (!parsed) return null;

  if (parsed.kind === "movie") {
    const card = await findShow(parsed.imdb, false, signal);
    if (!card) return null;
    const dyn = await api.dynamic(card.id, undefined, signal);
    const episodeId = dyn.post_info?.episode_id;
    if (!episodeId) return null;
    return {
      showId: card.id,
      episodeId,
      title: dyn.post_info?.title || card.title,
      year: api.yearOf(dyn.post_info) ?? card.year ?? null,
    };
  }

  const show = await findShow(parsed.imdb, true, signal);
  if (!show) return null;

  // The first response carries the current season; another season costs one more
  // request, and asking for the one already in hand costs nothing extra.
  const first = await api.dynamic(show.id, undefined, signal);
  const currentSeason = Number(first.post_info?.season_number);
  let dyn = first;
  if (currentSeason !== parsed.season) {
    const seasonId = seasonIdFor(first, parsed.season);
    if (seasonId == null) return null;
    dyn = await api.dynamic(show.id, seasonId, signal);
  }

  const episodes = episodesOf(dyn);
  // Episode numbering is carried in the title — "episode 1" — and positionally.
  // The title is preferred; the index is the fallback for the rows that are
  // named after the story instead of the number.
  const byTitle = episodes.find(
    (e) => Number(String(e.title ?? "").replace(/\D+/g, "")) === parsed.episode,
  );
  const match = byTitle ?? episodes[parsed.episode - 1];
  if (!match) return null;

  return {
    showId: show.id,
    episodeId: match.id,
    season: parsed.season,
    episode: parsed.episode,
    title: first.post_info?.title || show.title,
    year: api.yearOf(first.post_info) ?? show.year ?? null,
  };
}

/**
 * Cinema Box's own ids for a Stremio id, or null when it does not have the title.
 *
 * Anything that is not already an `abx:` id costs a metadata lookup and a
 * search, which is why the answer is cached — the stream pipeline asks on every
 * detail page the viewer opens.
 */
export async function resolveToAlbox(
  id: string,
  signal?: AbortSignal,
): Promise<AlboxTarget | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < (hit.target ? HIT_TTL_MS : MISS_TTL_MS)) return hit.target;

  try {
    const target = await resolveUncached(id, signal);
    // An aborted lookup can still finish tidily — a step that had already
    // resolved, a `null` handed back before the next call was made — so the
    // signal is checked rather than trusting that abandonment always arrives as
    // an exception. Nothing learned under an abort is worth keeping.
    //
    // Opening a title runs the stream pipeline twice and the second run aborts
    // the first, so an abort arrives on the ordinary path every single time.
    // Caching one as a miss is what once made Cinemana report nothing for a film
    // it had in six resolutions.
    if (!signal?.aborted) cache.set(id, { at: Date.now(), target });
    return target;
  } catch {
    // A failed lookup is not a miss: caching it would hide the title until the
    // TTL expired, long after the network recovered.
    return null;
  }
}
