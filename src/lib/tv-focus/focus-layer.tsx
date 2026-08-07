import { useEffect, type ReactNode } from "react";
import {
  useFocusable,
  FocusContext,
  getCurrentFocusKey,
} from "@noriginmedia/norigin-spatial-navigation";
import { isDpadPrimary } from "@/lib/platform";
import { hasLiveFocus, setFocusSafely } from "./keys";

/**
 * One screen in the view stack.
 *
 * The app keeps screens mounted behind the one on top so going back is instant.
 * They are hidden with `display: none`, which is enough for a mouse — nothing
 * is clickable — but not for a remote: the nodes are still registered, so the
 * D-pad can walk off the detail page onto a card of the home screen underneath
 * it, landing on something with no size at coordinates 0,0.
 *
 * Marking a hidden layer non-participating removes its whole subtree from the
 * search rather than each of its controls one by one. Focus can only ever be
 * somewhere on the screen the user is actually looking at.
 */
export function FocusLayer({
  top,
  className,
  children,
}: {
  top: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { ref, focusKey, hasFocusedChild } = useFocusable({
    focusable: top,
    saveLastFocusedChild: true,
    autoRestoreFocus: true,
    trackChildren: true,
  });

  // Hand focus to the screen the moment it becomes the top one.
  //
  // Without this, changing screens leaves focus on a control of the screen that
  // just went to `display: none`: it has no geometry, so no direction leads
  // anywhere and the remote is simply dead. The lifeline does notice and repair
  // it, but it is a 400ms poll — long enough that a press right after switching
  // screens goes nowhere, which reads as the app ignoring the remote.
  //
  // The trigger is "focus is stranded", not "this layer just became top".
  //
  // Keying it to the transition missed the lazily-loaded screens — Settings,
  // Add-ons, Downloads are evicted when unused, so switching to one *mounts* its
  // layer already top. There is no transition to observe, and focus stayed
  // behind on the screen that just went to display:none.
  //
  // Asking whether the current focus is still on something real covers both
  // cases and stays quiet when it should: at startup the provider parks focus on
  // the sidebar, which is perfectly alive, so no layer steals it.
  useEffect(() => {
    if (!top || !isDpadPrimary()) return;
    // The user is already inside this screen; they navigated, not switched.
    if (hasFocusedChild) return;
    if (hasLiveFocus(getCurrentFocusKey())) return;
    // Focusing the layer descends to the child it remembers, so coming back to a
    // screen lands where it was left rather than at the top.
    setFocusSafely(focusKey);
  }, [top, hasFocusedChild, focusKey]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}
