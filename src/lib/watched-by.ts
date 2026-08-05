const KEY = "harbor.watchedby.v1";
const MAX = 300;

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function recordWatchedBy(mediaId: string | null, profileId: string | null): void {
  if (!mediaId || !profileId) return;
  const map = read();
  if (map[mediaId] === profileId) return;
  map[mediaId] = profileId;
  const keys = Object.keys(map);
  if (keys.length > MAX) {
    for (const k of keys.slice(0, keys.length - MAX)) delete map[k];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    return;
  }
}

export function getWatchedBy(mediaId: string): string | null {
  return read()[mediaId] ?? null;
}
