import { useCallback, useEffect, useRef } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { FocusableComponentLayout } from "@noriginmedia/norigin-spatial-navigation";
import { isDpadPrimary } from "@/lib/platform";
import { setFocusSafely } from "./keys";
import { revealInNearestScroller, useFocusScroll } from "./scroll-context";

export type FocusableControlOptions = {
  /** Runs on OK/Enter. Wire the control's own click handler here. */
  onSelect?: () => void;
  /** Runs when OK is held. Used for context actions that are a right-click on desktop. */
  onLongPress?: () => void;
  /** Stable key, so focus can be restored to this exact control by name. */
  focusKey?: string;
  /** Temporarily inert — a disabled button, a card still loading. */
  disabled?: boolean;
  /** Take focus as soon as it mounts. At most one per screen. */
  autoFocus?: boolean;
  /** Called when focus arrives, for previews and scroll-into-view. */
  onFocus?: () => void;
  /**
   * Lets a control answer a direction itself instead of surrendering focus.
   *
   * Return `false` to consume the press. A carousel uses this so left and right
   * change the slide while up and down still leave — the control is one stop on
   * the page that happens to have internal state, rather than one stop per
   * slide, which is how a TV hero is expected to behave.
   */
  onArrowPress?: (direction: string) => boolean;
};

const LONG_PRESS_MS = 550;

/**
 * Registers one interactive control with the focus tree.
 *
 * This is the only way anything becomes reachable by the remote. A caption, a
 * wrapper div or a metadata chip simply never calls it, which is what makes
 * "only interactive controls can receive focus" a property of the design rather
 * than a filter applied afterwards.
 */
export function useFocusableControl(options: FocusableControlOptions = {}) {
  const { onSelect, onLongPress, focusKey, disabled = false, autoFocus = false, onFocus, onArrowPress } = options;

  const longPressFired = useRef(false);
  const timer = useRef(0);

  // Enter arrives as keydown; Norigin reports press and release separately, so
  // a hold is the gap between them rather than a repeat count.
  const handleEnterPress = useCallback(() => {
    if (!onLongPress) return;
    longPressFired.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressFired.current = true;
      navigator.vibrate?.(12);
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const handleEnterRelease = useCallback(() => {
    window.clearTimeout(timer.current);
    if (longPressFired.current) {
      // The hold already did its thing; do not also fire the tap action.
      longPressFired.current = false;
      return;
    }
    onSelect?.();
  }, [onSelect]);

  // Ancestors register how to bring this node into view; focus travels outward
  // through the row, then the page.
  const scrollIntoFocus = useFocusScroll();

  const handleFocus = useCallback(
    (layout: FocusableComponentLayout) => {
      const node = layout?.node;
      // Last line of defence, and the only one that holds no matter how focus
      // arrived. A control can be registered, participating and perfectly
      // reachable by direction while being invisible — inside a screen that has
      // just been hidden, a collapsed panel, an empty state that shrank to
      // nothing. Landing there leaves no highlight anywhere and no way out, so
      // rather than try to predict every such case, refuse to come to rest on
      // one and hand focus to something the user can actually see.
      if (node instanceof HTMLElement) {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const unusable =
          box.width <= 0 ||
          box.height <= 0 ||
          style.visibility === "hidden" ||
          // Hover-only affordances — a card's remove-from-list cross, say — sit
          // at zero opacity until a pointer is over them. A remote never hovers,
          // so they would be permanently invisible stops. The action itself is
          // not lost: cards expose it on long press.
          style.opacity === "0";
        if (unusable) {
          setFocusSafely();
          return;
        }
      }
      if (node instanceof HTMLElement) {
        scrollIntoFocus?.(node);
        // The declared chain handles rows and the pages that opted in. If the
        // control is still off screen after it runs, the page it lives on never
        // declared itself, so find whatever is scrolling it.
        const box = node.getBoundingClientRect();
        const offScreen =
          box.top < 0 ||
          box.bottom > window.innerHeight ||
          box.left < 0 ||
          box.right > window.innerWidth;
        if (offScreen) revealInNearestScroller(node);

        // Some controls cannot be revealed by any amount of scrolling because
        // they are not laid out on the page at all — an overlay that parks its
        // close button at negative coordinates instead of unmounting it, for
        // one. Focus there is invisible and immovable, so treat "still entirely
        // outside the viewport after trying" the same as unusable.
        const after = node.getBoundingClientRect();
        const stranded =
          after.right <= 0 ||
          after.bottom <= 0 ||
          after.left >= window.innerWidth ||
          after.top >= window.innerHeight;
        if (stranded) {
          setFocusSafely();
          return;
        }
      }
      onFocus?.();
    },
    [scrollIntoFocus, onFocus],
  );

  const { ref, focused, focusSelf, focusKey: assignedKey } = useFocusable<
    object,
    HTMLElement
  >({
    focusable: !disabled,
    focusKey,
    onEnterPress: onLongPress ? handleEnterPress : undefined,
    onEnterRelease: onLongPress ? handleEnterRelease : () => onSelect?.(),
    onFocus: handleFocus,
    onArrowPress: onArrowPress ? (direction: string) => onArrowPress(direction) : undefined,
    // A control is a leaf; there is nothing below it to remember.
    saveLastFocusedChild: false,
  });

  useEffect(() => {
    if (autoFocus && isDpadPrimary() && !disabled) focusSelf();
  }, [autoFocus, disabled, focusSelf]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    ref,
    /** True only while the remote is on this control. */
    focused: isDpadPrimary() ? focused : false,
    focusSelf,
    focusKey: assignedKey,
    /** Spread onto the element: marks it for the focus ring and for tests. */
    focusProps: {
      "data-tv-focused": isDpadPrimary() && focused ? "true" : undefined,
    },
  };
}
