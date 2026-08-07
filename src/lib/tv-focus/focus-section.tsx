import { useCallback, useRef, type ReactNode, type Ref } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { ScrollProvider, revealWithin } from "./scroll-context";

/**
 * A region the D-pad treats as one place: the sidebar, a page body, a modal.
 *
 * `saveLastFocusedChild` is the point of it. Leaving the sidebar for the content
 * and coming back should land on the item you left, not the top — the behaviour
 * every TV app has, and the one a geometric engine cannot express because it has
 * no concept of a container to remember anything about.
 */
export function FocusSection({
  focusKey,
  children,
  className,
  onFocus,
  rememberChild = true,
  autoRestoreFocus = true,
  isFocusBoundary = false,
  inert = false,
  scrolls = false,
  as: Tag = "div",
  ref: externalRef,
  ...rest
}: {
  focusKey?: string;
  children: ReactNode;
  className?: string;
  onFocus?: () => void;
  /** Off for regions where focus should always enter at the first control. */
  rememberChild?: boolean;
  autoRestoreFocus?: boolean;
  /** True for modals: the D-pad must not walk out into the page underneath. */
  isFocusBoundary?: boolean;
  /**
   * Takes the whole region out of the search — used when something covers it,
   * such as the player over the browsing UI. Hiding a region visually is not
   * enough: its controls stay registered, and the remote will happily walk onto
   * one that is no longer on screen.
   */
  inert?: boolean;
  /** True when this element is the vertical scroll container for its content. */
  scrolls?: boolean;
  as?: "div" | "aside" | "nav" | "section" | "main";
  /** Callers that already measure this element keep their own handle on it. */
  ref?: Ref<HTMLElement>;
} & Record<string, unknown>) {
  const boxRef = useRef<HTMLElement | null>(null);

  const scroll = useCallback((node: HTMLElement) => {
    const box = boxRef.current;
    if (box) revealWithin(box, node, "vertical");
  }, []);

  const { ref, focusKey: assigned } = useFocusable({
    focusKey,
    focusable: !inert,
    isFocusBoundary,
    saveLastFocusedChild: rememberChild,
    autoRestoreFocus,
    trackChildren: true,
    onFocus,
  });

  // One element, three interested parties: the focus engine, the scroll helper
  // above, and whatever the caller was already doing with it.
  const attach = useCallback(
    (node: HTMLElement | null) => {
      boxRef.current = node;
      (ref as { current: HTMLElement | null }).current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef) (externalRef as { current: HTMLElement | null }).current = node;
    },
    [ref, externalRef],
  );

  const body = (
    <Tag ref={attach} className={className} {...rest}>
      {children}
    </Tag>
  );

  return (
    <FocusContext.Provider value={assigned}>
      {scrolls ? <ScrollProvider scroll={scroll}>{body}</ScrollProvider> : body}
    </FocusContext.Provider>
  );
}
