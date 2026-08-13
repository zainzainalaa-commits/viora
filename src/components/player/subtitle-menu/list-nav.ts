import type { KeyboardEvent } from "react";
import { setFocusSafely } from "@/lib/tv-focus";

/**
 * Walk a list by order instead of by geometry.
 *
 * The spatial navigator picks whatever rectangle sits nearest in the direction
 * pressed, which is the right answer on a page and the wrong one inside a short
 * scrolling box. The subtitle panel shows about three rows at a time: the fourth
 * is laid out below the fold, so the search field *under* the list is nearer to
 * the row you are on than the row you want, and down went there instead —
 * measured, the walk stepped out to "Hide search" and came back into the list
 * two languages further on.
 *
 * A list has an order, and the remote should follow it. Both ends stay open, so
 * the band above and the footer below are still reachable — but only from the
 * first and last rows, never from the middle.
 */
export function listKeyNav(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-list-row]")].filter(
    (row) => row.offsetParent !== null && !row.hasAttribute("disabled"),
  );
  if (rows.length === 0) return;

  const active = document.activeElement as HTMLElement | null;
  const current = active?.closest<HTMLElement>("[data-list-row]") ?? null;
  const at = current ? rows.indexOf(current) : -1;
  if (at === -1) return;

  const next = rows[at + (e.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;

  // Through the focus system, not `next.focus()`.
  //
  // A raw DOM focus leaves the navigator believing the highlight is still on the
  // row it put it on, and the next thing that consults its state puts it back.
  // Measured: down appeared to do nothing at all, five rows in a row.
  const key = next.getAttribute("data-list-key");
  if (key && setFocusSafely(key)) {
    e.preventDefault();
    e.stopPropagation();
    next.scrollIntoView({ block: "nearest" });
  }
}
