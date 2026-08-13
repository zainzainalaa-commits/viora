import type { KeyboardEvent } from "react";
import { SpatialNavigation } from "@noriginmedia/norigin-spatial-navigation";
import { setFocusSafely } from "@/lib/tv-focus";

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

/** Beyond this much of a screen, a jump is a leap: bring the page along instead. */
const FAR = 0.45;

/**
 * Keeps vertical movement on the detail page short.
 *
 * Two things go wrong on a long page with wide gaps in it, and both come from
 * the same place: the engine chooses the nearest control in the direction
 * pressed, measured from where things are *now*.
 *
 * Under the poster there are buttons; four hundred pixels below them, past the
 * description, is the episode toolbar, and a few hundred below that the
 * episodes themselves. Pressing down there made the page leap, and from its new
 * position the engine's next answer was the button it had just left — measured
 * on Silo, down from Resume reached an episode, the page scrolled seven hundred
 * pixels to show it, and down again went straight back to Resume. The two
 * traded focus forever and the episode list could not be reached at all.
 *
 * So a far target is not chosen at all: the page scrolls toward it and the
 * highlight stays where it is. One more press then moves normally, because by
 * then the target is close — and close is what the engine is good at.
 *
 * The other case is a section with nothing focusable in it, which the remote
 * cannot enter by definition: Awards & Recognition and Information are text. If
 * there is nothing at all in the direction pressed, the page scrolls by three
 * quarters of a screen so they can at least be read.
 */
export function pageScrollKeyNav(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  const container = e.currentTarget;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) return;

  const box = active.getBoundingClientRect();
  const down = e.key === "ArrowDown";
  const viewport = container.clientHeight;

  if (down && intoEpisodes(container, active, box)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  let nearest = Infinity;
  for (const el of container.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el.offsetParent === null || el.hasAttribute("disabled") || el === active) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const gap = down ? r.top - box.bottom : box.top - r.bottom;
    if (gap < -4) continue;
    if (gap < nearest) nearest = gap;
  }

  // Something close by: the engine's own answer is the right one.
  if (nearest <= viewport * FAR) return;

  const room = down
    ? container.scrollHeight - container.clientHeight - container.scrollTop
    : container.scrollTop;
  if (room <= 2) return;

  const step = Math.min(room, nearest === Infinity ? viewport * 0.75 : nearest + box.height);
  e.preventDefault();
  e.stopPropagation();
  container.scrollBy({ top: (down ? 1 : -1) * step, behavior: "smooth" });

  // And tell the engine the page moved.
  //
  // It navigates by a cached box for every control, so after a scroll it is
  // reasoning about where things used to be: measured, the press after this one
  // found nothing below and the screen's remembered child took the highlight
  // back to the top of the page. Once, when the scrolling has settled.
  window.clearTimeout(remeasure);
  remeasure = window.setTimeout(() => SpatialNavigation.updateAllLayouts(), 280);
}

let remeasure = 0;

/**
 * From the episode toolbar into the episodes.
 *
 * The one hop the engine would not make. From any of those buttons — shuffle,
 * the three layouts, the sort, the season — down went back to the Resume button
 * at the top of the page rather than to the cards directly beneath them; the
 * move found no candidate and the screen's remembered child took the highlight.
 * Naming the first card and going there is the whole of the fix, and it applies
 * only when standing in that toolbar with the cards below.
 */
function intoEpisodes(container: HTMLElement, active: HTMLElement, from: DOMRect): boolean {
  const section = container.querySelector<HTMLElement>("[data-episodes]");
  if (!section || !section.contains(active) || active.hasAttribute("data-ep")) return false;

  const first = section.querySelector<HTMLElement>("[data-ep]");
  if (!first) return false;
  if (first.getBoundingClientRect().top <= from.bottom) return false;

  return setFocusSafely("DETAIL_EPISODE_FIRST");
}
