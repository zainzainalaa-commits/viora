import { useSyncExternalStore } from "react";

const NEW_SECTIONS = new Set(["theme", "library"]);
const LS = "harbor.settingsNewSeen";

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let snapshot = readSeen().join(",");
const subs = new Set<() => void>();

export function markSectionSeen(id: string): void {
  if (!NEW_SECTIONS.has(id)) return;
  const seen = readSeen();
  if (seen.includes(id)) return;
  try {
    localStorage.setItem(LS, JSON.stringify([...seen, id]));
  } catch {
    /* ignore */
  }
  snapshot = readSeen().join(",");
  for (const fn of subs) fn();
}

export function useSettingsNew(): (id: string) => boolean {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
  const seen = new Set(snapshot ? snapshot.split(",") : []);
  return (id: string) => NEW_SECTIONS.has(id) && !seen.has(id);
}
