import { useEffect, useState } from "react";

/**
 * The list of rows Home is currently able to show, kept where Settings can read it.
 *
 * The customization itself already lives in `settings.homeRows`, so Settings can
 * edit it directly. What Settings cannot do is *know what there is to edit*: the
 * rows are assembled on Home from the installed addons, the user's catalogs and
 * a dozen settings, asynchronously and only while Home is mounted. Rebuilding
 * all of that inside Settings would mean two implementations of the same list
 * that quietly disagree.
 *
 * So Home publishes the shape of its rows — keys and default names, nothing
 * heavy — and Settings reads that. This is a derived cache, not user data: it
 * can always be rebuilt by opening Home, and losing it costs nothing.
 */
export type HomeRowEntry = {
  key: string;
  name: string;
  type: "movie" | "series";
};

const STORAGE_KEY = "viora.home.rowCatalog";
const CHANGED = "viora:home-row-catalog";

export function readHomeRowCatalog(): HomeRowEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is HomeRowEntry =>
        !!r && typeof (r as HomeRowEntry).key === "string" && typeof (r as HomeRowEntry).name === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Called by Home whenever its row list settles.
 *
 * Writes only when the list actually changed. Home recomputes its rows on every
 * catalog tick, and rewriting an identical list would wake every listener —
 * including the editor the user may be part-way through using.
 */
export function publishHomeRowCatalog(rows: HomeRowEntry[]): void {
  try {
    const next = JSON.stringify(rows);
    if (next === localStorage.getItem(STORAGE_KEY)) return;
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(CHANGED));
  } catch {
    // A full or unavailable store is not worth breaking Home over; the editor
    // simply shows what it last knew.
  }
}

export function useHomeRowCatalog(): HomeRowEntry[] {
  const [rows, setRows] = useState<HomeRowEntry[]>(() => readHomeRowCatalog());
  useEffect(() => {
    const sync = () => setRows(readHomeRowCatalog());
    window.addEventListener(CHANGED, sync);
    // Another window (or the settings sync) can rewrite it underneath us.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return rows;
}
