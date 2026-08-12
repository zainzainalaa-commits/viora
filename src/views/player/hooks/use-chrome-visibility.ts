import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { isDpadPrimary } from "@/lib/platform";
import { CHROME_HIDE_MS_PLAYING, CHROME_HIDE_MS_RESUME } from "../player-utils";

/**
 * When the transport is on screen.
 *
 * The version this replaces kept seven ways to wake the controls, three guards,
 * and armed its hide timer from inside the wake itself — and it never hid
 * anything. Hiding told the rest of the app the chrome was gone; that re-ran
 * the effect which wakes it; the wake armed a fresh timer. Measured on device:
 * `armed 1800ms -> HIDE -> wake -> armed 1800ms -> HIDE`, over and over, so the
 * bar was permanently up and focus permanently sat on a button over the film.
 *
 * This is the model TV players actually use, and it holds because the pieces
 * only point one way:
 *
 *   - Waking is local state and nothing else. It never calls outward, so
 *     nothing can call it back.
 *   - One effect owns the timer, keyed on what genuinely decides whether the
 *     controls should go: are they up, is it playing, is a menu open. Re-running
 *     it re-arms rather than stacking timers.
 *   - Telling the rest of the app is a separate effect that only writes.
 *
 * Paused keeps them up, which is the point of pausing.
 */
export function useChromeVisibility(params: {
  playing: boolean;
  drawMode: boolean;
  pipMode: boolean;
  setChromeHidden: (hidden: boolean) => void;
  keyboardPauseShowsControls: boolean;
}) {
  const { playing, drawMode, pipMode, setChromeHidden } = params;

  const [chromeVisible, setChromeVisible] = useState(true);
  const [anyMenuOpen, setAnyMenuOpen] = useState(false);
  // Bumped on every wake so the timer effect re-runs even when the controls are
  // already up: a second press has to buy another few seconds.
  const [wakeTick, setWakeTick] = useState(0);

  const chromeVisibleRef = useRef(chromeVisible);
  chromeVisibleRef.current = chromeVisible;

  /** Stable by construction, so nothing downstream re-runs because of it. */
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    setWakeTick((n) => n + 1);
  }, []);

  const hideChrome = useCallback(() => {
    setChromeVisible(false);
  }, []);

  const toggleChrome = useCallback(() => {
    if (chromeVisibleRef.current) setChromeVisible(false);
    else wakeChrome();
  }, [wakeChrome]);

  /** The resume path wants a shorter first hide than a normal press. */
  const resumeHideRef = useRef(false);
  const hideForResume = useCallback(() => {
    resumeHideRef.current = true;
  }, []);

  // The only place the controls are ever put away on their own.
  useEffect(() => {
    if (!chromeVisible) return;
    if (anyMenuOpen) return;
    // Paused, drawing, or picture-in-picture: they are being looked at on
    // purpose.
    if (!playing || drawMode || pipMode) return;
    const wait = resumeHideRef.current ? CHROME_HIDE_MS_RESUME : CHROME_HIDE_MS_PLAYING;
    resumeHideRef.current = false;
    const t = window.setTimeout(() => setChromeVisible(false), wait);
    return () => window.clearTimeout(t);
  }, [chromeVisible, wakeTick, playing, drawMode, pipMode, anyMenuOpen]);

  // Any press brings them back. Registered once, reading nothing that changes.
  useEffect(() => {
    const onInput = () => wakeChrome();
    window.addEventListener("keydown", onInput);
    window.addEventListener("touchstart", onInput);
    // No pointer on a television. The emulator parks a cursor over the video,
    // and every time the bar hid, the layout shifting under that stationary
    // cursor counted as movement and brought it straight back.
    if (!isDpadPrimary()) window.addEventListener("mousemove", onInput);
    return () => {
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("mousemove", onInput);
    };
  }, [wakeChrome]);

  // A menu opening is a reason to show them, and a reason not to count down.
  useEffect(() => {
    if (anyMenuOpen) setChromeVisible(true);
  }, [anyMenuOpen]);

  // Write-only, and the reason the loop is gone: this tells the rest of the app
  // what happened, and nothing tells it back.
  useEffect(() => {
    setChromeHidden(!chromeVisible && !pipMode);
    return () => setChromeHidden(false);
  }, [chromeVisible, pipMode, setChromeHidden]);

  const cursorStyle: CSSProperties =
    drawMode || (!chromeVisible && playing) ? { cursor: "none" } : { cursor: "default" };

  return {
    chromeVisible,
    wakeChrome,
    hideChrome,
    toggleChrome,
    hideForResume,
    anyMenuOpen,
    setAnyMenuOpen,
    cursorStyle,
  };
}
