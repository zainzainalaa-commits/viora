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
  autoRestoreFocus = false,
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
  /**
   * Whether *any* focus arriving at this region is redirected to the child it
   * remembers. Off by default, and that is deliberate.
   *
   * Remembering the child and auto-restoring it are two different things.
   * Remembering is what makes returning to a screen land where you left, and it
   * still happens — `resolveUsable` reads the remembered child when focus is
   * placed explicitly. Auto-restoring also fires when directional navigation
   * merely passes *through* the region, and then a press that should have
   * carried focus onward is redirected back to where it came from.
   *
   * That is the loop reported on Home: up out of a row found no sibling above,
   * bubbled to the parent, and the parent handed focus back to the row just
   * left — so two rows traded focus forever and the top of the page could never
   * be reached. The same mechanism froze the sidebar, whose parent remembered
   * the very item focus was sitting on.
   *
   * Layers still opt in: a screen you leave and come back to *should* restore.
   */
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
  as?: "div" | "aside" | "nav" | "section" | "main" | "header" | "footer";
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
    // See `useFocusRow`: this only feeds a `hasFocusedChild` no region reads, at
    // the price of re-rendering the region — and a region is a whole page body,
    // a sidebar, a settings panel — every time focus enters or leaves it.
    trackChildren: false,
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
