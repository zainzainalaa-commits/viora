import type { SubCue } from "../parser";
import type { TimingModel } from "./model";

/**
 * Remembering an alignment so it is computed once per subtitle, not once per
 * playback.
 *
 * The key has to describe the exact pair of files, because the answer is only
 * valid for that pair: a different release of the same film, or a different
 * upload of the same subtitle, needs a different correction. It also has to be
 * cheap — hashing whole subtitle files on a television box every time a viewer
 * opens a menu is the sort of thing that makes an app feel slow.
 *
 * So the fingerprint is taken from the shape of the cue list rather than its
 * text: how many events, where the first and last one sit, and a rolling sum of
 * the timings. Two different files agreeing on all of that are, for timing
 * purposes, the same file.
 */

export type CachedSync = {
  model: TimingModel;
  confidence: number;
  referenceId: string | null;
  referenceLabel: string | null;
  anchors: number;
  driftCorrected: boolean;
  at: number;
};

const KEY = "harbor.subsync.v1";
const MAX_ENTRIES = 60;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function fingerprintCues(cues: SubCue[]): string {
  if (cues.length === 0) return "0";
  let acc = 0;
  for (let i = 0; i < cues.length; i += 1) {
    // Centiseconds, so a re-parse of the same file lands on the same number.
    acc = (acc + Math.round(cues[i].start * 100) * (i + 1)) % 2147483647;
  }
  const first = Math.round(cues[0].start * 100);
  const last = Math.round(cues[cues.length - 1].end * 100);
  return `${cues.length}.${first}.${last}.${acc}`;
}

export function syncKey(mediaKey: string, selected: SubCue[], referenceIds: string[]): string {
  return `${mediaKey}|${fingerprintCues(selected)}|${[...referenceIds].sort().join(",")}`;
}

type Store = Record<string, CachedSync>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* a full quota is not worth failing playback over */
  }
}

export function loadSync(key: string): CachedSync | null {
  const store = read();
  const hit = store[key];
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) return null;
  return hit;
}

export function saveSync(key: string, value: Omit<CachedSync, "at">): void {
  const store = read();
  store[key] = { ...value, at: Date.now() };

  // Oldest out first, so a heavy viewer does not carry a year of entries.
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => store[a].at - store[b].at)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }
  write(store);
}
