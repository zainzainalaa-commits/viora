import type { ListSource } from "./types";

export type DetectResult = { source: ListSource; ref: string };

function clean(input: string): string {
  return input.trim().replace(/^@/, "");
}

function host(input: string): string | null {
  try {
    return new URL(input).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function path(input: string): string {
  try {
    return new URL(input).pathname;
  } catch {
    return input;
  }
}

function detectUrl(input: string, h: string): DetectResult | null {
  const p = path(input);
  if (h === "mdblist.com" || h.endsWith(".mdblist.com")) {
    const m = p.match(/\/lists\/([^/?#]+)\/([^/?#]+)/i);
    if (m) return { source: "mdblist", ref: `${m[1]}/${m[2]}` };
    const id = p.match(/\/lists\/(\d+)/i);
    if (id) return { source: "mdblist", ref: id[1] };
    return null;
  }
  if (h === "trakt.tv" || h.endsWith(".trakt.tv")) {
    const m = p.match(/\/users\/([^/?#]+)\/lists\/([^/?#]+)/i);
    if (m) return { source: "trakt", ref: `${m[1]}/${m[2]}` };
    return null;
  }
  if (h === "themoviedb.org" || h.endsWith(".themoviedb.org")) {
    const m = p.match(/\/list\/(\d+)/i);
    if (m) return { source: "tmdb", ref: m[1] };
    return null;
  }
  if (h === "letterboxd.com" || h.endsWith(".letterboxd.com")) {
    const list = p.match(/\/([^/?#]+)\/list\/([^/?#]+)/i);
    if (list) return { source: "letterboxd", ref: `${list[1]}/list/${list[2].replace(/\/$/, "")}` };
    const watch = p.match(/\/([^/?#]+)\/watchlist/i);
    if (watch) return { source: "letterboxd", ref: `${watch[1]}/watchlist` };
    return null;
  }
  if (h === "imdb.com" || h.endsWith(".imdb.com")) {
    const ls = p.match(/\/list\/(ls\d+)/i);
    if (ls) return { source: "imdb", ref: ls[1] };
    const user = p.match(/\/user\/(ur\d+)\/watchlist/i);
    if (user) return { source: "imdb", ref: user[1] };
    return null;
  }
  if (h === "myanimelist.net" || h.endsWith(".myanimelist.net")) {
    const profile = p.match(/\/(?:profile|animelist)\/([^/?#]+)/i);
    if (profile) return { source: "mal", ref: profile[1] };
    return null;
  }
  return null;
}

function detectBare(input: string): DetectResult | null {
  if (/^ls\d{4,}$/i.test(input)) return { source: "imdb", ref: input.toLowerCase() };
  if (/^[^/]+\/list\/[^/]+$/i.test(input)) return { source: "letterboxd", ref: input.replace(/\/$/, "") };
  if (/^[^/\s]+\/[^/\s]+$/.test(input)) return { source: "trakt", ref: input };
  return null;
}

export function detectSource(raw: string): DetectResult | null {
  const input = clean(raw);
  if (!input) return null;
  const h = host(input);
  if (h) return detectUrl(input, h);
  return detectBare(input);
}
