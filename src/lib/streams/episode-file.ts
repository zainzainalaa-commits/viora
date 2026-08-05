export type EpisodeHint = { season: number | null; episode: number | null };

const VIDEO_EXT_RE = /\.(mkv|mp4|avi|mov|m4v|webm|ts|flv|wmv|m2ts|mpg|mpeg|ogv|3gp)(\?|#|$)/i;

export function episodeFileRegex(season: number, episode: number): RegExp {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return new RegExp(
    `s0*${season}[^0-9]?e0*${episode}(?![0-9])|${s}${e}(?![0-9])|\\b${season}x0*${episode}(?![0-9])`,
    "i",
  );
}

export function matchEpisodeFileIndex(names: string[], hint: EpisodeHint | undefined): number {
  if (!hint || hint.season == null || hint.episode == null) return -1;
  const re = episodeFileRegex(hint.season, hint.episode);
  let anyMatch = -1;
  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? "";
    if (!re.test(name)) continue;
    if (VIDEO_EXT_RE.test(name)) return i;
    if (anyMatch < 0) anyMatch = i;
  }
  return anyMatch;
}
