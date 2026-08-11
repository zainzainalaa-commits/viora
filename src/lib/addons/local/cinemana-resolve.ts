import * as api from "./cinemana-api";
import type { CinemanaItem } from "./cinemana-api";

/**
 * Finding a Cinemana title from an id that did not come from Cinemana.
 *
 * Without this, Cinemana only ever answered for its own `cnm:` ids, so it
 * appeared on its own catalogue rows and nowhere else — open a film from
 * Cinemeta and it was never even asked, however plainly it was in the library.
 * Every other stream provider answers for `tt…` ids, and this is what lets this
 * one behave the same.
 *
 * Cinemana has no lookup by IMDb id, only a title search. It does however carry
 * `imdbUrlRef` on every record, including search results, so the sequence is:
 * get the title for the id, search on it, then confirm the match by IMDb id.
 * The confirmation is the important half — a title search for "Obsession"
 * returns a dozen unrelated films.
 *
 * Nothing here swallows a failure, and that is the whole discipline of the file.
 * Opening a title runs the stream pipeline twice and the second run aborts the
 * first, so an abort arrives on the ordinary path every single time. While the
 * search was wrapped in `.catch(() => [])`, that abort became an empty result,
 * an empty result became "Cinemana does not have this film", and that answer was
 * cached for half an hour — so Cinemana reported nothing for Spider-Man:
 * Homecoming, a film it has in six resolutions. A question that was never asked
 * has no answer worth remembering.
 */

const HIT_TTL_MS = 6 * 60 * 60 * 1000;
// Misses expire quickly: a title absent today may be added tomorrow, and the
// alternative is caching "not here" for a whole session.
const MISS_TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; nb: string | null }>();

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

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  // Cinemeta carries the year in `releaseInfo`, as "2019" or a range "2019-2023".
  const year = parseInt(String(m.releaseInfo ?? m.releaseDate ?? "").slice(0, 4), 10);
  return { name: m.name, year: Number.isFinite(year) ? year : null };
}

/**
 * Picks the record that is genuinely the same title.
 *
 * The IMDb id is the only identifier both sides agree on, so it decides
 * whenever it is present. The title-and-year fallback exists for the records
 * where Cinemana has no IMDb reference, and it deliberately refuses any record
 * that carries a *different* id — that is not a missing answer, it is a
 * contradicting one, and following it would play the wrong thing.
 */
function pickMatch(
  items: CinemanaItem[],
  want: { imdb: string; name: string; year: number | null; series: boolean },
): CinemanaItem | null {
  const sameKind = items.filter((it) => api.isSeries(it) === want.series);

  const byImdb = sameKind.find((it) => api.imdbIdFrom(it) === want.imdb);
  if (byImdb) return byImdb;

  if (want.year == null) return null;
  const target = normalize(want.name);
  return (
    sameKind.find((it) => {
      if (api.imdbIdFrom(it)) return false;
      if (Number(it.year) !== want.year) return false;
      const en = normalize(it.en_title ?? "");
      const ar = normalize(it.ar_title ?? "");
      return en === target || ar === target;
    }) ?? null
  );
}

async function findTitle(
  imdb: string,
  series: boolean,
  signal?: AbortSignal,
): Promise<CinemanaItem | null> {
  const type = series ? "series" : "movie";
  const info = await titleFor(type, imdb, signal);
  if (!info) return null;
  const results = await api.search(info.name, { type }, signal);
  if (results.length === 0) return null;
  return pickMatch(results, { imdb, name: info.name, year: info.year, series });
}

async function resolveUncached(id: string, signal?: AbortSignal): Promise<string | null> {
  const parsed = parseForeignId(id);
  if (!parsed) return null;

  if (parsed.kind === "movie") {
    return (await findTitle(parsed.imdb, false, signal))?.nb ?? null;
  }

  // A series id names the show; the stream has to be the one episode. Cinemana
  // models episodes as their own records under a root id, so the show is found
  // first and then walked.
  const show = await findTitle(parsed.imdb, true, signal);
  if (!show) return null;

  const episodes = await api.seasonEpisodes(api.rootIdOf(show), signal);
  const match = episodes.find(
    (ep) => Number(ep.season) === parsed.season && Number(ep.episodeNummer) === parsed.episode,
  );
  return match?.nb ?? null;
}

/**
 * Cinemana's own id for a Stremio id, or null when it does not have the title.
 *
 * `cnm:` ids pass straight through. Anything else costs a metadata lookup and a
 * search, which is why the answer is cached — the stream pipeline asks on every
 * detail page the user opens.
 */
export async function resolveToCinemanaId(
  id: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (id.startsWith("cnm:")) return id.slice(4);

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < (hit.nb ? HIT_TTL_MS : MISS_TTL_MS)) return hit.nb;

  try {
    const nb = await resolveUncached(id, signal);
    // An aborted lookup can still finish tidily — a step that had already
    // resolved, a `null` handed back before the next call was made — so the
    // signal is checked rather than trusting that abandonment always arrives as
    // an exception. Nothing learned under an abort is worth keeping.
    if (!signal?.aborted) cache.set(id, { at: Date.now(), nb });
    return nb;
  } catch {
    // A failed lookup is not a miss: caching it would hide the title until the
    // TTL expired, long after the network recovered.
    return null;
  }
}
