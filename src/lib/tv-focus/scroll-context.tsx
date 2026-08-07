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
  const box = container.getBoundingClientRect();
  const item = node.getBoundingClientRect();

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
