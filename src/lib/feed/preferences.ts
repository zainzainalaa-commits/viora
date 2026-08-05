const STORAGE_KEY = "harbor.feed-prefs.v1";

export type FeedVote = "up" | "down";

type Stored = {
  votes: Record<string, FeedVote>;
  updatedAt: number;
};

let cache: Stored | null = null;
const listeners = new Set<() => void>();

function load(): Stored {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { votes: {}, updatedAt: 0 };
      return cache;
    }
    const parsed = JSON.parse(raw) as Stored;
    cache = {
      votes: parsed.votes ?? {},
      updatedAt: parsed.updatedAt ?? 0,
    };
    return cache;
  } catch {
    cache = { votes: {}, updatedAt: 0 };
    return cache;
  }
}

function persist() {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

export function getVote(metaId: string): FeedVote | null {
  return load().votes[metaId] ?? null;
}

export function setVote(metaId: string, vote: FeedVote | null): void {
  const store = load();
  if (vote == null) {
    delete store.votes[metaId];
  } else {
    store.votes[metaId] = vote;
  }
  store.updatedAt = Date.now();
  persist();
}

export function getDownvotedIds(): Set<string> {
  const store = load();
  const ids = new Set<string>();
  for (const [id, v] of Object.entries(store.votes)) {
    if (v === "down") ids.add(id);
  }
  return ids;
}

export function getUpvotedIds(): Set<string> {
  const store = load();
  const ids = new Set<string>();
  for (const [id, v] of Object.entries(store.votes)) {
    if (v === "up") ids.add(id);
  }
  return ids;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
