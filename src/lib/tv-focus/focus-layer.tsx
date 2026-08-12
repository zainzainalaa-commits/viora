import { useEffect, useRef, type ReactNode } from "react";
import {
  useFocusable,
  FocusContext,
  doesFocusableExist,
  getCurrentFocusKey,
} from "@noriginmedia/norigin-spatial-navigation";
import { isDpadPrimary } from "@/lib/platform";
import { elementOf, hasLiveFocus, setFocusSafely } from "./keys";

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
  preferredChildFocusKey,
}: {
  top: boolean;
  className?: string;
  children: ReactNode;
  /**
   * Where focus should enter this screen the first time.
   *
   * Without it a screen has no entry point, so recovery walks its children and
   * takes the first one that registered — which is an accident of mount order,
   * not a decision. On Home that put the opening highlight on the dismissable
   * "add a TMDB key" banner: stable, legal, and the wrong place for a viewer to
   * start. Naming the destination is what makes arriving on a screen land
   * somewhere chosen.
   */
  preferredChildFocusKey?: string;
}) {
  const { ref, focusKey, hasFocusedChild } = useFocusable({
    focusable: top,
    // A screen is where the D-pad lives, and it cannot walk out of one.
    //
    // The navigation rail sits outside every layer, so without this the engine
    // treats it as just another neighbour: up from the top row, left from the
    // first card, or any edge at all hands the highlight to the menu. That is
    // the difference between a rail you go to and a rail you fall into. Arrows
    // now stay inside the screen; Back is what reaches the rail, deliberately.
    //
    // It bounds leaving, not entering, so pressing right off the rail still
    // walks into the screen.
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    // Off, and the screen still returns you where you left.
    //
    // Restoring belongs to *arriving at the screen*, which happens through the
    // explicit `setFocusSafely(focusKey)` below — and that path reads the
    // remembered child itself. Leaving the flag on also restored when directional
    // navigation merely entered the screen: pressing right out of the sidebar
    // landed not on the first row but on whichever row was last visited, deep
    // down the page, and up from there bounced between two rows without ever
    // reaching the top.
    autoRestoreFocus: false,
    trackChildren: true,
    preferredChildFocusKey,
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
  // Being alive is not the same as being reachable.
  //
  // A screen fills the whole region, so its box starts at the origin and encloses
  // the topbar rather than sitting below it. The engine compares facing edges, so
  // from a topbar control the screen is not "down" — it is all around, and no
  // direction leads into it. On screens that also drop the sidebar there is no
  // way in at all: focus stays on the search button, perfectly valid and
  // completely stuck, which is exactly what Settings and Live did.
  //
  // So a layer claims focus when it takes over unless focus is already inside it
  // — not only when focus is stranded. Claiming once per turn at the top is what
  // keeps this from becoming a trap: afterwards the user is free to walk out to
  // the topbar and stay there.
  const claimed = useRef(false);
  if (!top && claimed.current) claimed.current = false;

  /**
   * The last place the viewer stood on this screen.
   *
   * Kept here rather than read back out of the engine because the question this
   * answers — "where was I when I left?" — has a different answer from the one
   * the engine stores for a parent, which is also written by directional entry.
   * A screen must come back to the card you opened a title from, and only fall
   * back to its declared entry when it has never been visited.
   */
  const lastInside = useRef<string | null>(null);
  useEffect(() => {
    if (!top || !isDpadPrimary()) return;
    const remember = () => {
      const key = getCurrentFocusKey();
      if (!key || key === focusKey) return;
      const el = elementOf(key);
      if (el && ref.current instanceof HTMLElement && ref.current.contains(el)) {
        lastInside.current = key;
      }
    };
    const id = window.setInterval(remember, 250);
    return () => window.clearInterval(id);
  }, [top, focusKey, ref]);

  useEffect(() => {
    if (!top || !isDpadPrimary()) return;
    if (claimed.current) return;

    // A declared entry point usually mounts after the screen does — it waits on
    // data. Measured on Home: the layer claims at ~1s, the hero registers at
    // ~3s, so the claim was always spent before the destination existed and
    // focus fell to whichever control happened to register first. Waiting for
    // the named child is what turns the declaration into something real.
    const pending = () => !!preferredChildFocusKey && !doesFocusableExist(preferredChildFocusKey);

    // A keypress means the viewer has taken over, and moving focus under them
    // would be worse than starting in the wrong place.
    let acted = false;
    const onKey = () => {
      acted = true;
    };
    window.addEventListener("keydown", onKey, true);

    /**
     * True when the viewer is standing in the navigation rather than on the
     * screen that just changed under them.
     *
     * Pressing OK on a sidebar entry swaps the screen, and the incoming layer
     * claimed focus for itself — but nothing named an entry point yet, so the
     * claim fell through to "topmost, then leftmost", which is the Search button
     * at the very top of the sidebar. So every trip through the menu ended with
     * the highlight thrown back to the first item, and the entry the viewer had
     * just chosen lost it.
     *
     * The sidebar is not part of any screen; it stays while they come and go. If
     * focus is on a live control inside it, the viewer is still using the menu
     * and the new screen has no business taking the highlight off their hands.
     */
    const inPersistentNav = (): boolean => {
      const key = getCurrentFocusKey();
      if (!key || !hasLiveFocus(key)) return false;
      const el = document.activeElement;
      return !!el && !!el.closest("aside");
    };

    const place = () => {
      claimed.current = true;
      window.removeEventListener("keydown", onKey, true);
      if (inPersistentNav()) return;
      // Ask for the declared entry point by name, and fall back to the layer.
      //
      // Focusing the layer and letting it descend relies on the engine having
      // stored the preferred child and on the walk choosing it — measured on
      // Home, the hero was registered, a leaf, usable and uncovered, and focus
      // still opened on the sidebar. Naming the destination removes the
      // inference: the fallback still descends the layer, so a screen with no
      // entry point behaves exactly as before.
      if (acted) return;
      // Where the viewer was beats where the screen would like them to start.
      // Coming back from a title's page has to land on the card it was opened
      // from; the declared entry is for a screen being seen for the first time.
      const remembered = lastInside.current;
      const targets: string[] = [];
      if (remembered && doesFocusableExist(remembered)) targets.push(remembered);
      if (preferredChildFocusKey) targets.push(preferredChildFocusKey);
      targets.push(focusKey);
      setFocusSafely(...targets);

      // A screen that is still fetching has to settle somewhere, and settling is
      // not the same as deciding. The source screen waits on every addon it has,
      // which on a slow network runs past the wait above; the highlight then went
      // to whatever sat highest on the page — the Refresh button — and stayed
      // there after the Play button it was supposed to open on had appeared.
      //
      // So the declaration outlives the placement: while the viewer has not
      // pressed anything, the entry point is claimed the moment it exists.
      if (!preferredChildFocusKey || doesFocusableExist(preferredChildFocusKey)) return;
      let late = 0;
      const upgrade = window.setInterval(() => {
        if (acted || ++late > 40) {
          window.clearInterval(upgrade);
          return;
        }
        if (doesFocusableExist(preferredChildFocusKey)) {
          window.clearInterval(upgrade);
          setFocusSafely(preferredChildFocusKey);
        }
      }, 250);
      upgradeTimer = upgrade;
    };

    let upgradeTimer = 0;

    if (!pending()) {
      // The user is already inside this screen; they navigated, not switched.
      if (hasFocusedChild) {
        claimed.current = true;
        window.removeEventListener("keydown", onKey, true);
        return;
      }
      place();
      return () => {
        window.clearInterval(upgradeTimer);
        window.removeEventListener("keydown", onKey, true);
      };
    }

    // Bounded, so a screen whose entry point never arrives still settles rather
    // than leaving the claim open forever.
    let tries = 0;
    const timer = window.setInterval(() => {
      if (!pending() || ++tries > 24) {
        window.clearInterval(timer);
        place();
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(upgradeTimer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [top, hasFocusedChild, focusKey, preferredChildFocusKey]);

  return (
    <FocusContext.Provider value={focusKey}>
      {/* Marks which screen is on top, so a last-resort landing can be confined
          to it rather than falling out to the navigation rail. */}
      <div
        ref={ref}
        className={className}
        data-focus-layer={top ? "top" : undefined}
        // Published so recovery can read it. A screen that keeps re-rendering —
        // the source list, as its addons answer one by one — loses the focused
        // node repeatedly, and each recovery landed on whatever was topmost at
        // that instant, so the highlight crawled down the page on its own.
        data-focus-entry={preferredChildFocusKey}
      >
        {children}
      </div>
    </FocusContext.Provider>
  );
}
