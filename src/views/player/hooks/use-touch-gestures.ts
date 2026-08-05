import { useCallback, useRef } from "react";
import { isTouchPrimary } from "@/lib/platform";

const DOUBLE_TAP_MS = 280;
/** Left and right thirds seek; the middle third toggles playback. */
const EDGE_FRACTION = 1 / 3;
const SEEK_STEP_SEC = 10;

type Options = {
  onToggleChrome: () => void;
  onPlayPause: () => void;
  onSeekBy: (deltaSec: number) => void;
  enabled?: boolean;
};

export type TouchGestureHandlers = {
  onPointerUp?: (e: React.PointerEvent<HTMLElement>) => void;
};

/**
 * The player reveals its controls on `mousemove`, an event a finger never
 * produces, so without this the chrome is unreachable on touch.
 *
 * Single tap toggles the controls; a second tap inside the double-tap window
 * seeks when it lands on the left or right third, or toggles playback in the
 * middle. Play/pause deliberately does *not* fire on a single tap: on a phone
 * the whole video is the tap target, and pausing every time you want to check
 * the remaining time is worse than one extra tap.
 */
export function useTouchGestures({
  onToggleChrome,
  onPlayPause,
  onSeekBy,
  enabled = true,
}: Options): TouchGestureHandlers {
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<number | null>(null);

  const active = enabled && isTouchPrimary();

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!active || e.pointerType === "mouse") return;
      if (e.target !== e.currentTarget) return;

      const now = Date.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);

      if (now - lastTapAt.current < DOUBLE_TAP_MS) {
        // Second tap: cancel the pending chrome toggle and act on position.
        if (singleTapTimer.current != null) {
          window.clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }
        lastTapAt.current = 0;
        if (x < EDGE_FRACTION) {
          navigator.vibrate?.(10);
          onSeekBy(-SEEK_STEP_SEC);
        } else if (x > 1 - EDGE_FRACTION) {
          navigator.vibrate?.(10);
          onSeekBy(SEEK_STEP_SEC);
        } else {
          onPlayPause();
        }
        return;
      }

      lastTapAt.current = now;
      // Hold the single-tap action until the double-tap window closes,
      // otherwise every double tap also flashes the controls.
      singleTapTimer.current = window.setTimeout(() => {
        singleTapTimer.current = null;
        onToggleChrome();
      }, DOUBLE_TAP_MS);
    },
    [active, onToggleChrome, onPlayPause, onSeekBy],
  );

  return active ? { onPointerUp } : {};
}
