import { useEffect, useRef } from "react";
import { focusKeys, setFocusSafely } from "@/lib/tv-focus";
import { isDpadPrimary } from "@/lib/platform";

/**
 * The remote, inside the player.
 *
 * The bindings this replaces came from a desktop keyboard, where up and down are
 * volume. On a television that is the wrong instrument entirely: the remote has
 * its own volume keys, and up and down are the only way to reach the controls —
 * which is where subtitles and audio tracks live. Pressing down to turn the
 * volume down while the subtitle menu sits unreachable behind an invisible bar
 * is what made the player feel broken.
 *
 * What it does instead is the platform's own pattern, the one YouTube and every
 * other TV player follows:
 *
 *   OK, controls hidden   pause, and bring the controls up
 *   OK, on a control      press that control
 *   down / up             bring the controls up, without pausing
 *   left / right          seek, handled by the existing hotkeys
 *   Back                  put the controls away; again to leave
 *
 * It runs in the capture phase because the navigation engine also listens for
 * arrows: when the controls are down, focus is sitting on a button nobody can
 * see, and letting the engine move between invisible buttons is precisely the
 * behaviour being removed.
 */
export function useTvPlayerKeys(params: {
  chromeVisible: boolean;
  playing: boolean;
  anyMenuOpen: boolean;
  hasOverlay: boolean;
  wakeChrome: () => void;
  hideChrome: () => void;
  pause: () => void;
}) {
  const { chromeVisible, playing, anyMenuOpen, hasOverlay, wakeChrome, hideChrome, pause } = params;

  // Read through a ref: the listener is installed once, and re-installing it on
  // every frame of playback would drop keys pressed in between.
  const state = useRef(params);
  state.current = params;

  useEffect(() => {
    if (!isDpadPrimary()) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = state.current;
      // A menu or a dialog owns the remote while it is open; so does a text
      // field, which on this device means the on-screen keyboard is up.
      if (s.anyMenuOpen || s.hasOverlay) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      const key = e.key;
      const isOk = key === "Enter" || key === " ";
      const isDown = key === "ArrowDown";
      const isUp = key === "ArrowUp";
      if (!isOk && !isDown && !isUp) return;

      if (s.chromeVisible) {
        // The controls are up and focus is on something visible. Enter belongs
        // to that control, and the arrows to the navigation engine.
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (isOk && s.playing) s.pause();
      s.wakeChrome();
      // After the bar has been told to appear, so there is something to land on.
      window.setTimeout(() => setFocusSafely(focusKeys.player), 60);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Nothing should hold focus while the controls are down: a button at opacity
  // zero still takes arrow presses, and the viewer would be moving along a bar
  // they cannot see.
  useEffect(() => {
    if (!isDpadPrimary()) return;
    if (chromeVisible) return;
    if (anyMenuOpen || hasOverlay) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) active.blur();
  }, [chromeVisible, anyMenuOpen, hasOverlay]);

  void playing;
  void wakeChrome;
  void hideChrome;
  void pause;
}
