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

  const { ref, focusKey: assigned } = useFocusable({
    focusKey,
    saveLastFocusedChild: true,
    // Remember the column, but do not pull focus back here just because a
    // vertical press passed through. Auto-restoring turned "up out of this row"
    // into "back into this row", so two rows traded focus forever and the top of
    // the page could not be reached. The remembered column is still honoured
    // when focus is placed on the row deliberately.
    autoRestoreFocus: false,
    // Off, because nothing asks. The flag exists only to drive a React state
    // update on the row every time focus crosses its boundary, and a row's
    // render carries all thirty to sixty of its cards with it. Measured on Home:
    // one press cost 190ms of blocked main thread against 45ms in the sidebar,
    // for a value no caller has ever read. Remembering the column is a different
    // flag — `saveLastFocusedChild` above — and it stays on.
    trackChildren: false,
    preferredChildFocusKey,
    onFocus,
  });

  return { ref, focusKey: assigned, scroll };
}
