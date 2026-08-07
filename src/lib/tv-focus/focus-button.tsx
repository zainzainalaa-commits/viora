import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { useCallback, useRef } from "react";
import { useFocusableControl } from "./use-focusable-control";

/**
 * A real remote's OK press is a trusted key event, and Chromium turns a trusted
 * Enter on a focused `<button>` into a click all by itself. The engine then
 * reports the release and we click it again — one press, two activations, which
 * on a Play button means starting playback and immediately restarting it.
 *
 * Suppressing the engine's click whenever the browser has just delivered one
 * covers both orderings, and does it without depending on which platforms fire
 * the native click, or on whether that ever changes.
 */
const DOUBLE_FIRE_WINDOW_MS = 400;

/**
 * A `<button>` that is reachable by the remote.
 *
 * Swapping `<button>` for this is the whole migration for a screen: same
 * attributes, same styling, same click handler. What changes is that the
 * control now says so, instead of waiting to be found by something scanning the
 * page and guessing which of the twelve buttons in a hero section is the one
 * you meant.
 *
 * The plain `<button>` remains correct for anything the remote should skip — a
 * hover-only affordance, a scroll chevron, a close cross that Back already
 * covers.
 */
export function FocusButton({
  onClick,
  onLongPress,
  focusKey,
  autoFocus,
  disabled,
  ref: externalRef,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "autoFocus"> & {
  onLongPress?: () => void;
  focusKey?: string;
  autoFocus?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const lastClickAt = useRef(0);

  const { ref, focusProps } = useFocusableControl({
    // The click path stays the source of truth, so a mouse and a remote cannot
    // drift apart: Enter clicks the button rather than calling the handler.
    onSelect: () => {
      if (Date.now() - lastClickAt.current < DOUBLE_FIRE_WINDOW_MS) return;
      const node = ref.current;
      if (node instanceof HTMLElement) node.click();
    },
    onLongPress,
    focusKey,
    autoFocus,
    disabled,
  });

  const attach = useCallback(
    (node: HTMLButtonElement | null) => {
      (ref as { current: HTMLElement | null }).current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef) (externalRef as { current: HTMLButtonElement | null }).current = node;
    },
    [ref, externalRef],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      lastClickAt.current = Date.now();
      onClick?.(event);
    },
    [onClick],
  );

  return <button ref={attach} onClick={handleClick} disabled={disabled} {...focusProps} {...rest} />;
}
