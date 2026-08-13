import type { KeyboardEvent } from "react";

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

/**
 * Holds a row at its two ends, and only there.
 *
 * Running right off the last card used to drop into whatever sat below it — from
 * the episode toolbar into the image gallery further down the page — which is
 * not what the press meant. The row should simply stop.
 *
 * The library's own boundary would do it, but it blocks every direction at once:
 * measured with it on, down from an episode no longer left the row either, so
 * the press failed and the screen put the highlight back on the toolbar above.
 * Down and up have to stay open, because leaving a row vertically is how a page
 * is read — so the edge is held here, for the two directions that need it.
 */
export function rowEdgeKeyNav(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

  const active = document.activeElement as HTMLElement | null;
  if (!active || !e.currentTarget.contains(active)) return;

  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.offsetParent === null || el.hasAttribute("disabled")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (items.length === 0) return;

  const at = items.indexOf(active);
  if (at === -1) return;

  // Which end is "last" depends on the writing direction, and this app runs in
  // both: in Arabic the row grows to the left, so right is where it started.
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
  const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
  const atEdge = forward ? at === items.length - 1 : at === 0;
  if (!atEdge) return;

  e.preventDefault();
  e.stopPropagation();
}
