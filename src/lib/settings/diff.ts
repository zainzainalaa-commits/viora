import type { Settings } from "./types";

/** Panels build new objects immutably, so an identity check catches every real
 *  edit. The JSON fallback only runs for keys whose identity changed, which
 *  keeps the large values (theme background image, custom font data URLs) out
 *  of the comparison unless they were actually touched. */
function valueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function changedSettingKeys(a: Settings, b: Settings): string[] {
  if (a === b) return [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (!valueEqual(a[k as keyof Settings], b[k as keyof Settings])) out.push(k);
  }
  return out;
}

export function settingsEqual(a: Settings, b: Settings): boolean {
  return a === b || changedSettingKeys(a, b).length === 0;
}
