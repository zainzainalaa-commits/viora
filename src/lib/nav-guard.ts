/** Lets a view veto navigation away from itself — used by Settings to prompt
 *  about unsaved changes. The guard is consulted by pop/goForward/setView in
 *  lib/view.tsx, so every exit path is covered from one place.
 *
 *  A guard returns true to block. It is responsible for eventually calling the
 *  `proceed` callback it was handed (or dropping it, if the user cancels). */
export type NavGuard = (proceed: () => void) => boolean;

let guard: NavGuard | null = null;

export function setNavGuard(fn: NavGuard | null): void {
  guard = fn;
}

/** Returns true when navigation was blocked; the caller must then do nothing. */
export function runNavGuard(proceed: () => void): boolean {
  if (!guard) return false;
  return guard(proceed);
}
