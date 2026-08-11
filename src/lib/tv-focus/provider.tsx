import { useEffect, type ReactNode } from "react";
import {
  GetBoundingClientRectAdapter,
  init,
  pause,
  resume,
  setKeyMap,
  updateRtl,
  getCurrentFocusKey,
  doesFocusableExist,
  navigateByDirection,
} from "@noriginmedia/norigin-spatial-navigation";
import { isDpadPrimary } from "@/lib/platform";
import {
  focusKeys,
  hasLiveFocus,
  installFocusDiagnostics,
  isElementCovered,
  isElementOffscreen,
  setFocusSafely,
  syncDomFocus,
} from "./keys";

/**
 * Android TV delivers D-pad presses as key codes rather than the named keys a
 * desktop keyboard produces, and remotes differ by manufacturer. Both forms are
 * mapped so one build serves a dev keyboard and a real remote; WASD is included
 * because the emulator sends it when the host keyboard is attached.
 */
const KEY_MAP = {
  up: [38, 19, 87],
  down: [40, 20, 83],
  left: [37, 21, 65],
  right: [39, 22, 68],
  enter: [13, 23, 32],
};

function documentIsRtl(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dir === "rtl";
}

let started = false;

function startEngine(): void {
  if (started) return;
  started = true;

  init({
    debug: (() => { try { return localStorage.getItem("viora.focusDebug") === "on"; } catch { return false; } })(),
    visualDebug: false,

    // Holding a direction should keep moving. Norigin throttles by default,
    // which makes a long row feel like it is refusing input.
    throttle: 0,
    throttleKeypresses: false,

    // Move real DOM focus along with the tree. The app already styles
    // `html[data-input="dpad"] :focus` for across-the-room visibility, and
    // keeping native focus in sync is also what makes screen readers and text
    // inputs behave.
    shouldFocusDOMNode: true,
    // Scrolling is ours: the row and the page decide together where the focused
    // card should sit. Letting the WebView also scroll produces two competing
    // animations and a card that lands somewhere neither of them intended.
    domNodeFocusOptions: { preventScroll: true },

    // One rect read per control instead of a walk up its ancestors.
    //
    // The engine's default measures a node by reading offsetTop, offsetLeft,
    // offsetHeight, offsetWidth and then climbing the offsetParent chain reading
    // two more properties at every step. Each of those reads forces the browser
    // to recompute layout, and a press re-measures every focusable sibling — for
    // a card inside a Home row that is thirty to sixty cards on a page with
    // eleven hundred registered nodes.
    //
    // Profiled on device: that one function was 24% of the entire sampled
    // window, and a press blocked the main thread for ~185ms against 45ms in the
    // sidebar, whose rows are short. `getBoundingClientRect` answers the same
    // question in a single call, so the browser lays out once and every
    // subsequent read in the same batch is free.
    layoutAdapter: GetBoundingClientRectAdapter,

    // Posters, action buttons and list rows are not the same size, and
    // center-to-center distance punishes a wide neighbour for being wide.
    // Comparing facing edges is what makes "right" mean the thing on the right.
    distanceCalculationMethod: "edges",

    rtl: documentIsRtl(),
  });

  setKeyMap(KEY_MAP);
}

/** Arabic flips the meaning of left and right; the engine has to be told. */
function useRtlSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const apply = () => updateRtl(documentIsRtl());
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, [enabled]);
}

/**
 * Guarantees the app always has focus somewhere.
 *
 * Focus dies whenever the node holding it unmounts — a row re-renders, a modal
 * closes, a lazy image replaces a placeholder with a real card. Rather than have
 * every screen defend against that individually, one watcher notices the tree
 * has no live focus and puts it back on the nearest sensible surface.
 */
/**
 * Repairs stale focus at the instant a key is pressed, before the engine acts.
 *
 * Screens are kept mounted and hidden with `display: none`, so switching leaves
 * focus on a control that still exists but now measures zero by zero. Nothing
 * about that moment is observable from a React effect: the new screen commits
 * before the old one is hidden, so a check there still sees healthy focus, and
 * by the time it goes stale there is nothing left to re-run.
 *
 * Checking on keydown removes the timing question entirely. The listener is in
 * the capture phase so it runs before the engine reads the current focus, which
 * makes the very first press after a screen change land somewhere real rather
 * than being swallowed while a poll catches up.
 */
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const ARROW_DIRECTIONS: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Text entry keeps the arrows: they move the caret, not the focus. */
function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !ADJUSTABLE_INPUT_TYPES.has((el as HTMLInputElement).type);
}

/** Controls whose value the arrows change, rather than moving away from. */
const ADJUSTABLE_INPUT_TYPES = new Set(["range", "number", "date", "time"]);

function isAdjustable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && ADJUSTABLE_INPUT_TYPES.has((el as HTMLInputElement).type);
}

/**
 * The control the user has stepped *into*, if any.
 *
 * A slider is the one place where a TV remote is genuinely ambiguous: the same
 * left and right that move between controls are also the only way to change a
 * value. Desktop resolves this with a pointer; Android TV resolves it with a
 * mode. Pressing OK steps into the control, the arrows then belong to it, and
 * Back or OK steps out again.
 */
let adjusting: HTMLElement | null = null;

function setAdjusting(el: HTMLElement | null): void {
  if (adjusting) adjusting.removeAttribute("data-tv-adjusting");
  adjusting = el;
  if (el) el.setAttribute("data-tv-adjusting", "true");
}

function useFocusRepairOnInput(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const repair = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const editing = isEditable(active);

      // Stepping into and out of a value control. OK toggles the mode; Back
      // leaves it. Both are consumed so the press cannot also mean "activate" or
      // "go back a screen" while the user is only trying to finish adjusting.
      const isEnter = event.key === "Enter" || event.keyCode === 13 || event.keyCode === 23;
      const isBack = event.key === "Escape" || event.keyCode === 27 || event.keyCode === 4;

      if (adjusting && (isBack || isEnter)) {
        setAdjusting(null);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!adjusting && isEnter && isAdjustable(active)) {
        setAdjusting(active);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // A text field is a stop on the way past, not a room you fall into. OK
      // steps in and hands the arrows to the caret; the default is left alone so
      // the press still reaches the field and Android raises its keyboard.
      if (!adjusting && isEnter && editing) {
        setAdjusting(active as HTMLElement);
        event.stopPropagation();
        return;
      }
      if (adjusting && ARROW_KEYS.has(event.key)) {
        // The arrows belong to the control now. The default is *not* prevented,
        // so the native control still changes its value; propagation is stopped
        // so the engine never sees a reason to move focus off it.
        event.stopPropagation();
        return;
      }
      // Outside adjust mode a value control is just another stop on the way
      // past, so the browser must not quietly change it as focus moves through.
      if (!adjusting && isAdjustable(active) && ARROW_KEYS.has(event.key)) {
        event.preventDefault();
      }

      // The WebView performs its own directional focus traversal on top of the
      // engine's. Left alone it walks the DOM's focus out of dialogs the engine
      // is deliberately holding, and out of any region the engine refuses to
      // leave, with no way for the engine to know it happened. Suppressing the
      // default leaves exactly one system moving focus. Propagation is untouched
      // so the engine still receives the key; text fields keep the arrows they
      // need for the caret.
      // Merely holding focus in a text field is not the same as typing in one.
      // Settings opens with focus in its search box, and treating that as typing
      // handed every arrow to the caret: the field swallowed the D-pad and the
      // remote was dead on every one of the twenty-two subpages. Only a field the
      // user has actually stepped into keeps the arrows.
      const typing = editing && adjusting === active;
      if (!typing && ARROW_KEYS.has(event.key)) event.preventDefault();

      // Suppressing the default is not enough to get *out* of a field. The engine
      // declines to act on keys aimed at an input — reasonably, since it cannot
      // know whether the caret wants them — so with the WebView's own traversal
      // already suppressed, nothing moved focus at all and the field became a
      // trap. Asking the engine to navigate explicitly is what turns a field back
      // into an ordinary stop, for every editable control at once.
      if (!typing && editing && ARROW_KEYS.has(event.key)) {
        event.stopPropagation();
        navigateByDirection(ARROW_DIRECTIONS[event.key], {});
        return;
      }

      const key = getCurrentFocusKey();
      if (key && doesFocusableExist(key) && hasLiveFocus(key)) {
        // Re-assert the engine's choice in case the two have already diverged.
        if (!typing) syncDomFocus(key);
        return;
      }
      setFocusSafely(focusKeys.content, focusKeys.sidebar);
    };
    window.addEventListener("keydown", repair, { capture: true });
    return () => window.removeEventListener("keydown", repair, { capture: true });
  }, [enabled]);
}

/**
 * Focus may not come to rest on a control that is painted under something else.
 *
 * This is the general form of the modal trap, and it needs no notion of what a
 * modal is. Whatever puts an overlay on screen — a dialog, a confirmation, the
 * player, a picker — the controls it covers stay mounted and focusable, and both
 * the engine and the WebView will happily walk onto one. The user sees no
 * highlight anywhere, because the control holding focus is behind the backdrop,
 * and the remote appears dead.
 *
 * Rejecting the landing and re-placing focus on something actually visible turns
 * every overlay in the app into a focus trap by construction, rather than by each
 * one remembering to ask for one. A control that is not covered never matches, so
 * ordinary navigation is untouched.
 */
/**
 * Focus on a wrapper is focus nowhere.
 *
 * Side panels and inline sheets open by putting DOM focus on their own container
 * so screen readers announce them. On a TV that is a dead end: the container has
 * no highlight the user can see, frequently sits at the origin with the size of
 * the whole page, and the engine has no record of it, so every direction is
 * computed from the wrong place. It is how "Customize Home" left the remote
 * pointing at the application root.
 *
 * A real control is something the user can press. Anything else holding focus
 * while containing controls of its own is a wrapper, and focus belongs on one of
 * those instead.
 */
const PRESSABLE = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "VIDEO"]);

function isContainerFocus(el: HTMLElement): boolean {
  if (PRESSABLE.has(el.tagName) || el.isContentEditable) return false;
  if (el.getAttribute("role") === "gridcell") return false;
  return !!el.querySelector("button,a[href],input,select,textarea,[tabindex]");
}

function useCoverageGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // A field is exempt from the coverage and container tests — it can hold
      // focus legitimately — but never from the authority test below, which is
      // the whole point: an unasked-for landing in a text field is exactly the
      // interference being corrected.
      if (!isEditable(target) && (isElementCovered(target) || isContainerFocus(target))) {
        // Only bounce if somewhere better exists; during a transition the whole
        // screen can be briefly covered, and moving focus nowhere is worse.
        setFocusSafely();
        return;
      }

      // Anything the engine did not choose is not focus, it is interference.
      //
      // Instrumenting the trap showed a `focusin` on the settings search box with
      // no `focus()` call anywhere before it: no application code moved focus, so
      // the WebView's own directional traversal did, and suppressing the key's
      // default is not enough to stop it. The engine sets its key before it
      // focuses the node, so a landing that disagrees with the engine can only
      // have come from outside it, and belongs back where the engine put it.
      if (adjusting === target) return;
      const key = getCurrentFocusKey();
      if (key) syncDomFocus(key);
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [enabled]);
}

/**
 * On a remote, focus is the only pointer there is.
 *
 * Large parts of this UI came from a desktop client and reveal themselves on
 * hover: cast details, channel previews, volume sliders, rating pickers, the
 * hero's description. A mouse user gets all of it; a remote user gets a
 * highlight and nothing else, because `mouseenter` never fires for them. Thirty
 * of the thirty-nine components doing this have no focus handler at all.
 *
 * Rather than teach each one about focus, focus is translated into the hover it
 * already understands. React synthesises `onMouseEnter`/`onMouseLeave` from
 * native `mouseover`/`mouseout`, so dispatching those with the right
 * `relatedTarget` reaches every existing handler unchanged — and anything added
 * later gets the same treatment for free.
 */
function useHoverFollowsFocus(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    // Runtime kill switch, so the bridge can be isolated on a running build
    // rather than by comparing two binaries that differ in more than one way.
    if (localStorage.getItem("viora.hoverBridge") === "off") return;

    const send = (target: EventTarget | null, type: string, related: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          relatedTarget: related instanceof HTMLElement ? related : null,
        }),
      );
    };

    const onFocusIn = (e: FocusEvent) => send(e.target, "mouseover", e.relatedTarget);
    const onFocusOut = (e: FocusEvent) => send(e.target, "mouseout", e.relatedTarget);

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [enabled]);
}

/**
 * Shows `title` text on focus, because a remote can never hover to see it.
 *
 * Sixty-five controls explain themselves through the `title` attribute, which
 * the browser reveals only under a stationary pointer. On a TV that help does
 * not exist: the tooltip is unreachable, and several of those controls are
 * icon-only buttons whose meaning lives entirely in that string. Rendering it
 * for the focused control turns all of them into self-explanatory controls at
 * once, and needs no change to any of the components carrying one.
 */
function useTitleTooltips(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const tip = document.createElement("div");
    tip.id = "viora-tv-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);

    const hide = () => {
      tip.hidden = true;
    };

    const show = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement)) return hide();
      const text = (el.getAttribute("title") || el.getAttribute("data-title") || "").trim();
      if (!text) return hide();

      // A control that already says what it is does not need to be told again.
      // Sidebar items carry both a label and a matching `title`, so every one of
      // them was opening a floating box repeating its own word over whatever sat
      // underneath it. Only controls with no visible text of their own — icon
      // buttons — have anything to explain.
      const visible = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (visible && visible.toLowerCase().includes(text.toLowerCase())) return hide();

      tip.textContent = text;
      tip.hidden = false;

      // Prefer below the control, flipping above when there is no room, and
      // clamped so a control near an edge never pushes its own explanation off
      // screen.
      const box = el.getBoundingClientRect();
      const size = tip.getBoundingClientRect();
      const below = box.bottom + 10;
      const top = below + size.height > window.innerHeight ? box.top - size.height - 10 : below;
      const left = Math.min(
        Math.max(8, box.left + box.width / 2 - size.width / 2),
        window.innerWidth - size.width - 8,
      );
      tip.style.top = `${Math.max(8, top)}px`;
      tip.style.left = `${left}px`;
    };

    document.addEventListener("focusin", show, true);
    document.addEventListener("focusout", hide, true);
    return () => {
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("focusout", hide, true);
      tip.remove();
    };
  }, [enabled]);
}

function useFocusLifeline(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    // The very first placement goes to the sidebar. Handing it to the content
    // instead means landing on whichever card happened to register first, which
    // is neither the top of the page nor anywhere the user was looking. The
    // sidebar is always on screen and always in the same place; from there one
    // press of right enters the content deliberately.
    let firstPlacement = true;
    const check = () => {
      // The engine's opinion and the DOM's can differ, and an overlay that opens
      // without any key being pressed produces no event to reconcile them. Until
      // one does, the highlight sits on a control behind the new dialog while the
      // engine reports everything is fine — so the DOM is checked on its own
      // terms, not through the engine's key.
      const active = document.activeElement;
      // Being a text field earns an exemption from the coverage and container
      // checks — a field can legitimately hold focus while the user types — but
      // not from this one. A field that is off screen cannot be typed into
      // either, and leaving Settings was parking focus on exactly that.
      if (
        active instanceof HTMLElement &&
        (isElementOffscreen(active) ||
          (!isEditable(active) && (isElementCovered(active) || isContainerFocus(active))))
      ) {
        setFocusSafely();
        timer = window.setTimeout(check, 400);
        return;
      }

      const key = getCurrentFocusKey();
      // Existing is not enough: focus can come to rest on a container that was
      // still empty when it was handed control, and a container cannot move.
      if (!key || !doesFocusableExist(key) || !hasLiveFocus(key)) {
        if (firstPlacement) {
          if (setFocusSafely(focusKeys.sidebar)) firstPlacement = false;
        } else {
          setFocusSafely(focusKeys.content, focusKeys.sidebar);
        }
      }
      timer = window.setTimeout(check, 400);
    };
    timer = window.setTimeout(check, 400);
    return () => window.clearTimeout(timer);
  }, [enabled]);
}

export function TVFocusProvider({ children }: { children: ReactNode }) {
  const active = isDpadPrimary();

  // Started during render, on purpose, and on every platform rather than only
  // on a TV.
  //
  // `init` is what builds the layout adapter, and every registration measures
  // its node through that adapter. Skipping init on desktop left it undefined,
  // so the first control to mount threw "Cannot read properties of undefined
  // (reading 'measureLayout')" from inside a promise — nothing visible on
  // screen, one rejection per control.
  //
  // An effect would be too late even so: children run their effects before
  // their parent, so they would register against an engine that does not exist
  // yet. Rendering happens top-down, so doing it here is what guarantees the
  // engine is ready before any child can reach it. The call is idempotent.
  startEngine();

  useEffect(() => {
    // Pausing is the honest way to say "this is not the input here": the key
    // handlers check the flag and return, so arrow keys behave normally on a
    // desktop while the focus tree itself stays valid.
    if (active) resume();
    else pause();
  }, [active]);

  useRtlSync(active);
  useFocusRepairOnInput(active);
  useCoverageGuard(active);
  useHoverFollowsFocus(active);
  useTitleTooltips(active);
  useFocusLifeline(active);

  useEffect(() => {
    installFocusDiagnostics(() => getCurrentFocusKey() ?? null);
  }, []);

  return <>{children}</>;
}
