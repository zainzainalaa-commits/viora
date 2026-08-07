import { useEffect, useRef, type ReactNode } from "react";
import { getCurrentFocusKey } from "@noriginmedia/norigin-spatial-navigation";
import { isDpadPrimary } from "@/lib/platform";
import { FocusSection } from "./focus-section";
import { useBackHandler } from "./use-back-handler";
import {
  focusInsideScope,
  focusIsWithinTopScope,
  popModalScope,
  pushModalScope,
  setFocusSafely,
  topModalScope,
} from "./keys";

/**
 * A modal, as the remote experiences it.
 *
 * Three things have to be true at once, and none of them are true by default:
 *
 *  - The D-pad must not walk out of it into the page behind. `isFocusBoundary`
 *    is what makes the dialog the edge of the world while it is open.
 *  - Back must close it, before the page underneath gets to interpret Back as
 *    "go back a screen".
 *  - Closing must return focus to whatever opened it. A mouse user still has a
 *    cursor when the dialog disappears; a remote user has nothing unless the
 *    control they pressed is handed focus back.
 */
export function FocusModal({
  children,
  onClose,
  className,
  focusKey,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  focusKey?: string;
}) {
  const opener = useRef<string | null>(null);
  const root = useRef<HTMLElement | null>(null);

  if (opener.current === null && isDpadPrimary()) {
    opener.current = getCurrentFocusKey() || "";
  }

  useBackHandler(() => {
    if (!onClose) return false;
    onClose();
    return true;
  });

  useEffect(() => {
    if (!isDpadPrimary()) return;
    const el = root.current;
    if (!el) return;
    pushModalScope(el);

    // Children register on their own mount, which has not necessarily happened
    // by the time this effect runs, so the first attempt can legitimately find
    // an empty dialog. Retrying briefly costs nothing and covers content that
    // arrives with the step, the fetch, or the animation.
    let tries = 0;
    const claim = () => {
      if (focusInsideScope(el)) return;
      if (++tries < 12) timer = window.setTimeout(claim, 50);
    };
    let timer = window.setTimeout(claim, 0);

    // The WebView can still hand DOM focus to something behind the dialog before
    // any key reaches the engine. Correcting on the next key press leaves the
    // highlight visibly outside the dialog for one press; correcting the moment
    // it happens means it is never seen at all.
    const onFocusIn = (e: FocusEvent) => {
      if (topModalScope() !== el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      focusInsideScope(el);
    };
    document.addEventListener("focusin", onFocusIn, true);

    // A dialog that is open must hold the remote. Focus can still end up outside
    // it — a control unmounting mid-dialog, a screen behind restoring a
    // remembered row — and from the user's side that is indistinguishable from a
    // dead remote, because everything still focusable is behind the backdrop.
    const guard = window.setInterval(() => {
      if (!el.isConnected) return;
      if (!focusIsWithinTopScope(getCurrentFocusKey())) focusInsideScope(el);
    }, 250);

    const returnTo = opener.current;
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(guard);
      document.removeEventListener("focusin", onFocusIn, true);
      popModalScope(el);
      if (returnTo) setFocusSafely(returnTo);
    };
  }, []);

  return (
    <FocusSection
      ref={root}
      isFocusBoundary
      rememberChild={false}
      focusKey={focusKey}
      className={className}
    >
      {children}
    </FocusSection>
  );
}
