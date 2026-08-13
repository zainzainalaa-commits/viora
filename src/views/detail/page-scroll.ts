import type { KeyboardEvent } from "react";

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

/**
 * Scrolls a page that has run out of things to focus.
 *
 * The remote moves between controls, so a section made only of text is a place
 * it cannot go — and on the detail page the last two sections, Awards &
 * Recognition and Information, are exactly that. Pressing down at the gallery
 * did nothing at all while half the page sat below the fold, unreadable.
 *
 * The names in those sections used to be links, which gave the remote somewhere
 * to land, but that meant walking a sentence one name at a time to get past it.
 * They are prose again; this is what carries the page instead.
 *
 * Only when there is genuinely nothing to move to: if any control lies in the
 * direction pressed, the navigator's own answer is the right one and this stays
 * out of the way.
 */
export function pageScrollKeyNav(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  const container = e.currentTarget;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) return;

  const box = active.getBoundingClientRect();
  const down = e.key === "ArrowDown";
  const reachable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].some((el) => {
    if (el.offsetParent === null || el.hasAttribute("disabled")) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return down ? r.top > box.bottom - 4 : r.bottom < box.top + 4;
  });
  if (reachable) return;

  const room = down
    ? container.scrollHeight - container.clientHeight - container.scrollTop
    : container.scrollTop;
  if (room <= 2) return;

  e.preventDefault();
  e.stopPropagation();
  container.scrollBy({ top: (down ? 1 : -1) * container.clientHeight * 0.75, behavior: "smooth" });
}
