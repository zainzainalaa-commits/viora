const KEY = "harbor.localcw.v1";
const MAX = 60;
const FINISHED_RATIO = 0.92;

export type LocalCwEntry = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  background?: string;
  season?: number;
  episode?: number;
  videoId?: string;
  positionMs: number;
  durationMs: number;
  t: number;
};

const subs = new Set<() => void>();
let version = 0;
let cache: Record<string, LocalCwEntry> | null = null;

function readAll(): Record<string, LocalCwEntry> {
  if (cache) return cache;
  let next: Record<string, LocalCwEntry>;
  try {
    const raw = localStorage.getItem(KEY);
    next = raw ? (JSON.parse(raw) as Record<string, LocalCwEntry>) : {};
  } catch {
    next = {};
  }
  cache = next;
  return next;
}

function writeAll(all: Record<string, LocalCwEntry>): void {
  cache = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
  version += 1;
  for (const fn of subs) fn();
}

export function saveLocalCw(entry: LocalCwEntry): void {
  if (!entry.id || (entry.type !== "movie" && entry.type !== "series")) return;
  const all = { ...readAll() };
  const finished = entry.durationMs > 0 && entry.positionMs / entry.durationMs >= FINISHED_RATIO;
  if (finished && entry.type === "movie") {
    if (!(entry.id in all)) return;
    delete all[entry.id];
  } else {
    all[entry.id] = entry;
    const ids = Object.keys(all);
    if (ids.length > MAX) {
      ids.sort((a, b) => all[a].t - all[b].t);
      for (const id of ids.slice(0, ids.length - MAX)) delete all[id];
    }
  }
  writeAll(all);
}

export function listLocalCw(): LocalCwEntry[] {
  return Object.values(readAll()).sort((a, b) => b.t - a.t);
}

export function localCwEntry(id: string): LocalCwEntry | null {
  return readAll()[id] ?? null;
}

export function clearLocalCw(id: string): void {
  const all = readAll();
  if (!(id in all)) return;
  const next = { ...all };
  delete next[id];
  writeAll(next);
}

export function subscribeLocalCw(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function localCwVersion(): number {
  return version;
}
