import type { Meta } from "../cinemeta";
import type { Settings, StreamingService } from "../settings";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

type Service = {
  id: number;
  providerIds?: number[];
  name: string;
  logo: string;
  tint: string;
  logoHeight?: number;
  logoFilter?: string;
};

const FORCE_WHITE = "brightness(0) invert(1)";

export const SERVICES: Record<StreamingService, Service> = {
  netflix: { id: 8, name: "Netflix", logo: "/services/netflix.svg", tint: "#E50914" },
  disney: {
    id: 337,
    name: "Disney+",
    logo: "/services/disney.svg",
    tint: "#0E47A1",
    logoHeight: 46,
    logoFilter: FORCE_WHITE,
  },
  hulu: { id: 15, name: "Hulu", logo: "/services/hulu.svg", tint: "#1CE783" },
  prime: { id: 9, providerIds: [9, 119], name: "Prime Video", logo: "/services/prime.svg", tint: "#00A8E1" },
  apple: { id: 350, name: "Apple TV+", logo: "/services/apple.svg", tint: "#FFFFFF" },
  max: { id: 1899, providerIds: [1899, 384], name: "Max", logo: "/services/max.svg", tint: "#9B6CFF" },
  paramount: {
    id: 531,
    providerIds: [531, 582, 1715, 1854],
    name: "Paramount+",
    logo: "/services/paramount.svg",
    tint: "#0064FF",
  },
  peacock: { id: 386, providerIds: [386, 387], name: "Peacock", logo: "/services/peacock.svg", tint: "#FF7112" },
  crunchyroll: { id: 283, name: "Crunchyroll", logo: "/services/crunchyroll.svg", tint: "#F47521" },
};

export function providerIdsFor(svc: Service): string {
  const ids = svc.providerIds ?? [svc.id];
  return ids.join("|");
}

type RawMovie = {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
};

type RawSeries = {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
};

const poster = (p?: string | null) => (p ? `${IMG}/w342${p}` : undefined);
const back = (p?: string | null) => (p ? `${IMG}/w780${p}` : undefined);
const year = (s?: string) => (s ? s.slice(0, 4) : undefined);
const rating = (v?: number) => (v && v > 0 ? v.toFixed(1) : undefined);

async function discover<T>(key: string, kind: "movie" | "tv", providerId: number, region: string) {
  const url = new URL(`${TMDB}/discover/${kind}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("with_watch_providers", String(providerId));
  url.searchParams.set("watch_region", region);
  url.searchParams.set("sort_by", "popularity.desc");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [] as T[];
    const json = (await res.json()) as { results?: T[] };
    return json.results ?? [];
  } catch {
    return [] as T[];
  }
}

export type ServiceRow = { service: StreamingService; name: string; metas: Meta[] };

export async function streamingRows(settings: Settings): Promise<ServiceRow[]> {
  if (!settings.tmdbKey) return [];
  const enabled = (Object.keys(SERVICES) as StreamingService[]).filter((s) => settings.streaming[s]);
  const tasks = enabled.map(async (svc): Promise<ServiceRow> => {
    const { id, name } = SERVICES[svc];
    const [movies, series] = await Promise.all([
      discover<RawMovie>(settings.tmdbKey, "movie", id, settings.region),
      discover<RawSeries>(settings.tmdbKey, "tv", id, settings.region),
    ]);
    const movieMetas: Meta[] = movies.slice(0, 12).map((m) => ({
      id: `tmdb:movie:${m.id}`,
      type: "movie",
      name: m.title,
      poster: poster(m.poster_path),
      background: back(m.backdrop_path),
      description: m.overview,
      releaseInfo: year(m.release_date),
      releaseDate: m.release_date,
      imdbRating: rating(m.vote_average),
    }));
    const seriesMetas: Meta[] = series.slice(0, 12).map((s) => ({
      id: `tmdb:tv:${s.id}`,
      type: "series",
      name: s.name,
      poster: poster(s.poster_path),
      background: back(s.backdrop_path),
      description: s.overview,
      releaseInfo: year(s.first_air_date),
      releaseDate: s.first_air_date,
      imdbRating: rating(s.vote_average),
    }));
    const interleaved: Meta[] = [];
    const max = Math.max(movieMetas.length, seriesMetas.length);
    for (let i = 0; i < max; i++) {
      if (movieMetas[i]) interleaved.push(movieMetas[i]);
      if (seriesMetas[i]) interleaved.push(seriesMetas[i]);
    }
    return { service: svc, name, metas: interleaved };
  });
  const rows = await Promise.all(tasks);
  return rows.filter((r) => r.metas.length > 0);
}
