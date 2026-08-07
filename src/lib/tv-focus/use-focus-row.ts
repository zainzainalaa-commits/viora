import { useCallback, type RefObject } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { revealWithin } from "./scroll-context";

/**
 * The carousel primitive, as a hook.
 *
 * `FocusRow` is the component form for simple cases; components that already
 * own their track element and its scroll machinery — `Row` above all — take the
 * behaviour this way instead, so nothing has to be restructured to join the
 * focus tree.
 *
 * What it contributes: the row becomes a real node, which is what lets
 * `saveLastFocusedChild` return you to the same column when you come back up,
 * and gives the cards inside it a place to ask to be scrolled into view.
 */
export function useFocusRow({
  trackRef,
  focusKey,
  preferredChildFocusKey,
  onFocus,
}: {
  trackRef: RefObject<HTMLElement | null>;
  focusKey?: string;
  preferredChildFocusKey?: string;
  onFocus?: () => void;
}) {
  const scroll = useCallback(
    (node: HTMLElement) => {
      const track = trackRef.current;
      if (track) revealWithin(track, node, "horizontal");
    },
    [trackRef],
  );

  const { ref, focusKey: assigned, hasFocusedChild } = useFocusable({
    focusKey,
    saveLastFocusedChild: true,
    autoRestoreFocus: true,
    trackChildren: true,
    preferredChildFocusKey,
    onFocus,
  });

  return { ref, focusKey: assigned, hasFocusedChild, scroll };
}
