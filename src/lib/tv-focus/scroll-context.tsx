import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Keeping the focused control on screen.
 *
 * A control is usually nested in a row inside a scrolling page, so landing on it
 * can require both a horizontal and a vertical move. Rather than have the
 * control know about its ancestors, each scrolling container contributes a
 * function and composes it with whatever the container above it registered.
 * Focus then travels outward: the row slides first, then the page.
 *
 * Everything writes scrollLeft/scrollTop directly. `scrollIntoView` with smooth
 * behaviour was the source of the old engine's worst failure — the next
 * keypress measured geometry mid-animation and picked a card that was no longer
 * where it looked.
 */

type ScrollFn = (node: HTMLElement) => void;

const ScrollContext = createContext<ScrollFn | null>(null);

export function useFocusScroll(): ScrollFn | null {
  return useContext(ScrollContext);
}

export function ScrollProvider({
  scroll,
  children,
}: {
  scroll: ScrollFn;
  children: ReactNode;
}) {
  const parent = useContext(ScrollContext);

  const chained = useMemo<ScrollFn>(
    () => (node) => {
      scroll(node);
      parent?.(node);
    },
    [scroll, parent],
  );

  return <ScrollContext.Provider value={chained}>{children}</ScrollContext.Provider>;
}

/**
 * Where the container is actually visible, rather than where its box is.
 *
 * A scrolling page usually runs underneath the fixed chrome — the topbar is
 * painted over the top of it, not above it — so revealing a control at the box's
 * top edge parks it behind that chrome. The control is focused, on screen by
 * every geometric test, and completely invisible: the highlight is simply gone,
 * which is what "up from a row lands nowhere" looked like on Home.
 *
 * The obstruction is measured rather than configured. Asking the document what
 * is painted at the top edge costs one hit test, needs no cooperation from the
 * page, and follows the chrome automatically when a theme changes its height or
 * drops the topbar entirely. `scroll-padding-top` is honoured first, because a
 * container that has declared its own inset has said something more reliable
 * than anything that can be inferred.
 */
function visibleTop(container: HTMLElement, box: DOMRect, x: number): number {
  const declared = parseFloat(getComputedStyle(container).scrollPaddingTop);
  if (Number.isFinite(declared) && declared > 0) return box.top + declared;

  const hit = document.elementFromPoint(x, box.top + 1);
  if (!hit || container.contains(hit) || hit.contains(container)) return box.top;
  const cover = hit.getBoundingClientRect();
  // Only something genuinely lying across the top counts. A cover taller than
  // half the container is not chrome, it is a dialog, and scrolling past it
  // would be the wrong answer to the wrong question.
  if (cover.bottom <= box.top || cover.bottom > box.top + box.height * 0.5) return box.top;
  return cover.bottom;
}

/**
 * Nudges a container so the node sits inside it with room to spare.
 *
 * The margin is what makes a carousel feel like it is ahead of the user: the
 * next card is already visible before they reach it, instead of appearing at
 * the moment focus lands on it.
 */
export function revealWithin(
  container: HTMLElement,
  node: HTMLElement,
  axis: "horizontal" | "vertical",
): void {
  const rect = container.getBoundingClientRect();
  const item = node.getBoundingClientRect();
  const top = axis === "vertical" ? visibleTop(container, rect, item.left + item.width / 2) : rect.top;
  const box = axis === "vertical" && top !== rect.top
    ? new DOMRect(rect.x, top, rect.width, rect.bottom - top)
    : rect;

  if (axis === "horizontal") {
    const lead = Math.min(item.width * 0.6, box.width * 0.25);
    if (item.left < box.left + lead) {
      container.scrollLeft -= box.left + lead - item.left;
    } else if (item.right > box.right - lead) {
      container.scrollLeft += item.right - (box.right - lead);
    }
    return;
  }

  const lead = Math.min(item.height * 0.5, box.height * 0.2);
  if (item.top < box.top + lead) {
    container.scrollTop -= box.top + lead - item.top;
  } else if (item.bottom > box.bottom - lead) {
    container.scrollTop += item.bottom - (box.bottom - lead);
  }

  // Anything inside the first screenful shows the page from its start.
  //
  // Revealing with a lead is right in the middle of a long page and wrong at the
  // top of one: it parks the first control near the top edge and leaves whatever
  // sits above it — on a title's page, the artwork and the name — scrolled out
  // of sight. Measured on a film: walking down the page and back up left the
  // backdrop at y=-432, so two thirds of the poster was gone and the screen read
  // as having lost its picture. Nothing above the fold needs scrolling to reach,
  // so the honest position for it is zero.
  if (container.scrollTop > 0) {
    const offsetWithin = item.top + container.scrollTop - box.top;
    if (offsetWithin < container.clientHeight) container.scrollTop = 0;
  }
}

function scrolls(el: HTMLElement, axis: "horizontal" | "vertical"): boolean {
  const style = getComputedStyle(el);
  if (axis === "vertical") {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    return style.overflowY === "auto" || style.overflowY === "scroll";
  }
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  return style.overflowX === "auto" || style.overflowX === "scroll";
}

/**
 * Last-resort reveal for pages that never registered a scroll container.
 *
 * The app has dozens of scrolling screens, and requiring each to declare itself
 * means the one that forgets has controls the remote can focus but not show —
 * the highlight sits below the fold and the screen looks frozen. Walking up
 * from the focused node to whatever is actually scrolling it needs no
 * cooperation from the page.
 *
 * This inspects the ancestry of a node that already has focus. It never looks
 * for something to focus, which is the part that has to stay declarative.
 */
export function revealInNearestScroller(node: HTMLElement): void {
  // Both axes, because a control can be below the fold, past the right edge, or
  // both — a settings row inside a horizontally scrolling tab strip hits all of
  // it at once. Each axis finds its own ancestor: they are rarely the same one.
  for (const axis of ["horizontal", "vertical"] as const) {
    let el = node.parentElement;
    while (el && el !== document.body) {
      if (scrolls(el, axis)) {
        revealWithin(el, node, axis);
        break;
      }
      el = el.parentElement;
    }
  }

  const box = node.getBoundingClientRect();
  const marginY = Math.min(box.height * 0.5, window.innerHeight * 0.2);
  if (box.top < marginY) {
    window.scrollBy(0, box.top - marginY);
  } else if (box.bottom > window.innerHeight - marginY) {
    window.scrollBy(0, box.bottom - (window.innerHeight - marginY));
  }
}
