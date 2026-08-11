import {
  SpatialNavigation,
  setFocus,
  doesFocusableExist,
} from "@noriginmedia/norigin-spatial-navigation";

/**
 * Stable focus keys for the surfaces the app addresses by name — the ones focus
 * falls back to, and the ones other screens hand control to. Everything else
 * gets a generated key, because nothing else needs to be named.
 */
export const focusKeys = {
  sidebar: "SIDEBAR",
  content: "CONTENT",
  player: "PLAYER",
} as const;

type TreeNode = {
  parentFocusKey: string;
  focusable: boolean;
  node?: unknown;
  lastFocusedChildKey?: string | null;
  preferredChildFocusKey?: string;
};

function treeOf(): Record<string, TreeNode> {
  return (
    (SpatialNavigation as unknown as { focusableComponents: Record<string, TreeNode> })
      .focusableComponents ?? {}
  );
}

/**
 * True when something else is painted on top of this control.
 *
 * This is how a dialog is recognised without anyone having to declare one. An
 * overlay does not hide the controls underneath it — they stay mounted,
 * registered, sized and perfectly focusable — so every check based on the
 * element alone says they are fine, and the remote walks onto a button sitting
 * behind a backdrop with no highlight anywhere on screen. Asking the document
 * what is actually at that point is the difference between a control being
 * present and a control being reachable, and it needs no guess about which
 * full-screen elements are "really" modal.
 */
/**
 * True when a scrolling ancestor is simply not showing this element yet.
 *
 * Clipped is not the same as covered. An item below the fold of a scrolling
 * column is painted nowhere, so asking the document what sits at its centre
 * answers with whatever is behind the column — and calling that "covered"
 * rejects it. That closes a loop with no way out: the control cannot be focused
 * because it is not visible, and it is never scrolled into view because nothing
 * ever focuses it.
 *
 * Measured on the sidebar: its content is 859px inside a 500px window, so
 * Calendar, My Library, Downloads, Add-ons, Settings and the account row were
 * all unreachable by remote — the D-pad stopped dead at Live TV.
 */
function isClippedByScroller(el: HTMLElement, box: DOMRect): boolean {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const scrollsY = parent.scrollHeight > parent.clientHeight + 1 &&
      (style.overflowY === "auto" || style.overflowY === "scroll");
    const scrollsX = parent.scrollWidth > parent.clientWidth + 1 &&
      (style.overflowX === "auto" || style.overflowX === "scroll");
    if (scrollsY || scrollsX) {
      // Judged at the point the hit test actually samples — the centre — not on
      // the whole box. An item straddling the fold has its top inside the
      // column and its centre outside it, so testing the box says "visible"
      // while the hit test still lands past the edge and reports a cover. That
      // gap is exactly where the sidebar's D-pad stopped.
      const view = parent.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      return cy < view.top || cy > view.bottom || cx < view.left || cx > view.right;
    }
    parent = parent.parentElement;
  }
  return false;
}

function isCovered(el: HTMLElement, box: DOMRect): boolean {
  // Out of its scroller's window, not underneath anything: reachable as soon as
  // focus asks for it, because landing there scrolls it in.
  if (isClippedByScroller(el, box)) return false;

  // Five points, because one point is a rumour.
  //
  // The centre alone is exactly where a card puts its own overlay control, and a
  // control that is not a descendant reads as foreign no matter how small it is
  // or who it belongs to. Measured on Home: every Continue Watching card is a
  // 322x211 button with a 56x56 play button floating over its middle, so all of
  // them were "covered", the whole row was unreachable, and down from the hero
  // had nowhere to go — the engine picked the row, the guard rejected the card
  // it landed on, and focus was put straight back on the hero. From the sofa
  // that is a remote that ignores you.
  //
  // What the guard is actually asking is whether the viewer would see a
  // highlight here, and the highlight is drawn on the border. So the corners are
  // sampled too, and one clear point is enough. A dialog backdrop still covers
  // every point of everything behind it, which is the case this exists for.
  //
  // The centre is tested first and returns on the spot when it is clear, so the
  // ordinary control still costs the one hit-test it always did.
  const spots = [
    [0.5, 0.5],
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
  ];

  let tested = 0;
  for (const [fx, fy] of spots) {
    const x = box.left + box.width * fx;
    const y = box.top + box.height * fy;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) return false;
    tested += 1;
    // The hit is normally a child of the control (its label or icon); an ancestor
    // means nothing foreign is stacked in between. Anything else is a cover.
    if (el === hit || el.contains(hit) || hit.contains(el)) return false;
  }

  // Nothing could be sampled — the control is off screen rather than buried, and
  // that is `isElementOffscreen`'s question, not this one.
  return tested > 0;
}

/**
 * Whether this element is currently painted under something else.
 *
 * Exposed so the guard can reject a focus landing without needing to know what
 * covered it — a dialog, a player overlay, a sheet. Any overlay gets the same
 * treatment without declaring itself, and a control that is not covered is never
 * touched, so nothing outside an overlay can be affected by this.
 */
/**
 * Whether this element lies wholly outside the screen.
 *
 * Deliberately not part of `isUsableLeaf`: a card in a horizontally scrolled row
 * is legitimately off screen right up until focus reaches it and the row scrolls
 * to reveal it, so refusing to focus such things would make long rows
 * unreachable. It matters only as a health check *after* the fact — focus that is
 * still off screen once everything has settled is focus the user cannot see, and
 * leaving Settings was landing exactly there.
 */
export function isElementOffscreen(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return true;
  return (
    box.bottom <= 0 || box.top >= window.innerHeight || box.right <= 0 || box.left >= window.innerWidth
  );
}

export function isElementCovered(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  return isCovered(el, box);
}

/**
 * Whether the DOM would actually give this element focus.
 *
 * The engine moves focus by calling `.focus()`, and on an element the document
 * does not consider focusable that call silently does nothing. The engine's key
 * advances anyway, so from that moment it is computing every direction from a
 * node the user's highlight is not on — and the remote appears to freeze while
 * the engine behaves correctly from the wrong place.
 *
 * This is not hypothetical. A section wrapping the Home hero became an empty
 * registered leaf once the controls inside it were taken out of the focus tree:
 * pressing right out of the sidebar moved the engine onto that `div`, `.focus()`
 * did nothing, and the highlight sat in the sidebar while every later press was
 * measured from the hero.
 */
function canHoldDomFocus(el: HTMLElement): boolean {
  // An explicit tabindex counts even at -1: that value keeps an element out of
  // the tab order while still letting `.focus()` place focus on it, which is
  // exactly what a container-shaped control like a hero carousel wants.
  if (el.hasAttribute("tabindex")) return true;
  if (el.isContentEditable) return true;
  return ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "VIDEO", "AUDIO", "IFRAME"].includes(
    el.tagName,
  );
}

/** A control that exists, is on screen, can actually be seen, and can take focus. */
function isUsableLeaf(key: string): boolean {
  const node = treeOf()[key];
  if (!node || !node.focusable) return false;
  if (!isLeaf(key)) return false;
  const el = node.node;
  if (!(el instanceof HTMLElement)) return false;
  if (!canHoldDomFocus(el)) return false;
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.opacity === "0") return false;
  return !isCovered(el, box);
}

/**
 * Walks a key down to a control that can genuinely hold focus.
 *
 * Preferring the remembered child at every level is what makes returning to a
 * screen land where it was left; refusing to stop anywhere that is not usable is
 * what stops the walk handing back a container, or a control belonging to a
 * screen that has since been hidden.
 */
function resolveUsable(key: string, depth = 0): string | null {
  const tree = treeOf();
  const node = tree[key];
  if (!node || depth > 12) return null;
  if (isUsableLeaf(key)) return key;
  // A node with no element of its own is a preset key awaiting a mount, not a
  // place to stand.
  for (const candidate of [node.preferredChildFocusKey, node.lastFocusedChildKey]) {
    if (!candidate || !tree[candidate] || !tree[candidate].focusable) continue;
    const found = resolveUsable(candidate, depth + 1);
    if (found) return found;
  }
  // Falling back to a child means picking where the screen *opens*, so the order
  // has to be the one the viewer sees: topmost, then leftmost.
  //
  // `Object.keys` is registration order, which is the order things happened to
  // mount — and on a network-backed page that changes between launches. Home
  // opened on whichever row won the race, so the same app opened on a different
  // row each time and the top of the page was never where focus began. Ordering
  // by geometry makes the entry point deterministic on every screen without any
  // of them having to declare one.
  const children: { key: string; top: number; left: number }[] = [];
  for (const childKey of Object.keys(tree)) {
    const child = tree[childKey];
    if (child.parentFocusKey !== key || !child.focusable) continue;
    const el = child.node;
    const box = el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    // A child with no box yet has not laid out; it sorts last rather than
    // winning by accident of being registered first.
    children.push({
      key: childKey,
      top: box && (box.width > 0 || box.height > 0) ? box.top : Number.POSITIVE_INFINITY,
      left: box && (box.width > 0 || box.height > 0) ? box.left : Number.POSITIVE_INFINITY,
    });
  }
  children.sort((a, b) => (Math.abs(a.top - b.top) > 1 ? a.top - b.top : a.left - b.left));
  for (const child of children) {
    const found = resolveUsable(child.key, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Any control the user can currently see, chosen deterministically.
 *
 * The last resort used to be a hardcoded sidebar key. That works right up until
 * a screen replaces the navigation container — Settings and Live unmount the
 * sidebar outright — and then it is worse than nothing: `setFocus` on a key with
 * no component still records it as the current focus, so the app ends up
 * pointing at something that does not exist, with no geometry and no way out.
 * Asking the tree what is actually on screen cannot go stale that way.
 */
function firstUsableLeaf(): string | null {
  const tree = treeOf();
  const scope = topModalScope();
  let best: { key: string; top: number; left: number } | null = null;
  for (const key of Object.keys(tree)) {
    if (!isUsableLeaf(key)) continue;
    const el = tree[key].node as HTMLElement;
    // While a dialog owns the remote, "anything on screen" means anything in the
    // dialog. Recovery that reaches past it would hand the user controls they
    // cannot see, underneath the backdrop.
    if (scope && !scope.contains(el)) continue;
    const box = el.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) continue;
    if (box.right < 0 || box.left > window.innerWidth) continue;
    // Topmost, then leftmost — so the same screen always recovers to the same
    // control rather than to whatever happened to register first.
    if (!best || box.top < best.top - 1 || (Math.abs(box.top - best.top) <= 1 && box.left < best.left)) {
      best = { key, top: box.top, left: box.left };
    }
  }
  return best ? best.key : null;
}

/**
 * How "never focus a container" is actually guaranteed.
 *
 * The engine resolves a focus target by walking down through registered
 * children until it reaches one that has none, so a node with children can
 * never become the resting focus. `focusable` does not mark a leaf — it marks
 * participation, and a container that opts out of it disappears from the walk
 * entirely, taking everything underneath it with it.
 *
 * The one gap is a container that is briefly empty: a row whose cards have not
 * mounted has no children, so it looks like a leaf and can be focused. That is
 * what this detects, and what the lifeline uses to move focus back off it.
 */
function isLeaf(key: string): boolean {
  const tree = (SpatialNavigation as unknown as { focusableComponents: Record<string, TreeNode> })
    .focusableComponents;
  const node = tree?.[key];
  if (!node || !node.focusable) return false;
  for (const childKey of Object.keys(tree)) {
    const child = tree[childKey];
    if (child.parentFocusKey === key && child.focusable) return false;
  }
  return true;
}

/**
 * Move focus to the first of these keys that resolves to a usable control.
 *
 * Every target is resolved to a leaf here rather than handed to the engine as a
 * container name. That is deliberate: `setFocus` on a name the engine cannot
 * resolve — a screen that has unmounted, a region that is currently empty —
 * still records that name as the current focus, leaving the app pointing at a
 * component with no element. Nothing can be measured, no direction leads
 * anywhere, and the remote goes dead with no error to explain it.
 *
 * No key is hardcoded as the final fallback. Screens are free to replace the
 * navigation container, so the only dependable answer to "where should focus go"
 * is whatever is actually on screen.
 */
export function setFocusSafely(...keys: string[]): boolean {
  const scope = topModalScope();
  for (const key of keys) {
    if (!doesFocusableExist(key)) continue;
    const leaf = resolveUsable(key);
    if (!leaf) continue;
    // A named target from the page underneath is not a legal destination while a
    // dialog is open — the screen behind still has a remembered row, and honouring
    // it is exactly how focus escapes a modal.
    if (scope) {
      const el = elementOf(leaf);
      if (!el || !scope.contains(el)) continue;
    }
    void setFocus(leaf);
    return true;
  }
  const anywhere = firstUsableLeaf();
  if (anywhere) {
    void setFocus(anywhere);
    return true;
  }
  return false;
}

/**
 * The stack of open modal scopes, innermost last.
 *
 * Registration is explicit rather than inferred from the DOM. An overlay cannot
 * be recognised by looking at it — `position: fixed` over the whole viewport
 * describes a dialog, a toast and the player alike — and guessing wrong means
 * either trapping the user in something that was never modal, or leaving a real
 * dialog unguarded. A component that knows it is a dialog says so.
 */
const modalScopes: HTMLElement[] = [];

export function pushModalScope(el: HTMLElement): void {
  if (!modalScopes.includes(el)) modalScopes.push(el);
}

export function popModalScope(el: HTMLElement): void {
  const at = modalScopes.indexOf(el);
  if (at >= 0) modalScopes.splice(at, 1);
}

/**
 * A read-only window onto the focus engine, for diagnosing remote behaviour on a
 * device where there is no debugger — which parent a control actually hangs off,
 * whether a dialog registered as a boundary, what the engine thinks is focused.
 * Reading it changes nothing; guessing at any of it has already cost more than
 * the handful of bytes this adds.
 */
export function installFocusDiagnostics(currentKey: () => string | null): void {
  (window as unknown as Record<string, unknown>).__vioraFocus = {
    current: currentKey,
    scope: () => topModalScope(),
    node: (key: string) => treeOf()[key],
    parents: (key: string) => {
      const out: string[] = [];
      let k: string | undefined = key;
      const tree = treeOf();
      while (k && tree[k] && out.length < 20) {
        const n: TreeNode = tree[k];
        out.push(`${k}[focusable=${n.focusable},boundary=${!!(n as { isFocusBoundary?: boolean }).isFocusBoundary}]`);
        k = n.parentFocusKey;
      }
      return out;
    },
    usable: (key: string) => isUsableLeaf(key),
    /** Every DOM node the engine knows about — the set the D-pad can reach. */
    registeredNodes: () => {
      const tree = treeOf();
      const out: HTMLElement[] = [];
      for (const key of Object.keys(tree)) {
        const node = tree[key].node;
        if (node instanceof HTMLElement) out.push(node);
      }
      return out;
    },
    childrenOf: (key: string) =>
      Object.keys(treeOf()).filter((k) => treeOf()[k].parentFocusKey === key),
  };
}

/**
 * The topmost thing covering the screen that the user can interact with.
 *
 * Used to answer one question: is something open that Back should close? A
 * registered scope is the reliable answer when there is one, but most of this
 * app's dialogs predate that and register nothing, so the DOM is asked directly.
 * The test is deliberately narrow — fixed, actually hit-testable, covering most
 * of the viewport, and containing something focusable — because its only job is
 * to distinguish "a dialog is open" from "nothing is open", and being wrong in
 * the permissive direction would make Back stop exiting screens.
 */
export function findTopOverlay(): HTMLElement | null {
  const scope = topModalScope();
  if (scope) return scope;

  let best: { el: HTMLElement; z: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("div,main,section,aside")) {
    const style = getComputedStyle(el);
    if (style.position !== "fixed" || style.pointerEvents === "none") continue;
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    const box = el.getBoundingClientRect();
    if (box.width < window.innerWidth * 0.5 || box.height < window.innerHeight * 0.5) continue;
    if (!el.querySelector("button,[tabindex],a[href],input,select,textarea")) continue;
    const z = parseInt(style.zIndex, 10) || 0;
    if (!best || z >= best.z) best = { el, z };
  }
  return best ? best.el : null;
}

/** The dialog currently owning the remote, if any. */
export function topModalScope(): HTMLElement | null {
  for (let i = modalScopes.length - 1; i >= 0; i--) {
    const el = modalScopes[i];
    if (el.isConnected) return el;
    modalScopes.splice(i, 1);
  }
  return null;
}

function elementOf(key: string): HTMLElement | null {
  const node = treeOf()[key]?.node;
  return node instanceof HTMLElement ? node : null;
}

/** The first control the user can see inside `root`, in reading order. */
function firstUsableLeafWithin(root: HTMLElement): string | null {
  const tree = treeOf();
  let best: { key: string; top: number; left: number } | null = null;
  for (const key of Object.keys(tree)) {
    if (!isUsableLeaf(key)) continue;
    const el = elementOf(key);
    if (!el || !root.contains(el)) continue;
    const box = el.getBoundingClientRect();
    if (!best || box.top < best.top - 1 || (Math.abs(box.top - best.top) <= 1 && box.left < best.left)) {
      best = { key, top: box.top, left: box.left };
    }
  }
  return best ? best.key : null;
}

/**
 * Put focus on the dialog's primary action, or failing that on anything in it.
 *
 * A dialog that opens without moving focus is the worst of both worlds on a
 * remote: it covers the screen, so the controls still holding focus underneath
 * are invisible, and the user is left pressing directions against a page they
 * cannot see. Marking the affirmative control means focus lands somewhere that
 * makes sense rather than merely somewhere legal.
 */
export function focusInsideScope(root: HTMLElement): boolean {
  const primary = root.querySelector<HTMLElement>("[data-focus-primary]");
  if (primary) {
    const tree = treeOf();
    for (const key of Object.keys(tree)) {
      if (elementOf(key) === primary && isUsableLeaf(key)) {
        void setFocus(key);
        return true;
      }
    }
  }
  const first = firstUsableLeafWithin(root);
  if (first) {
    void setFocus(first);
    return true;
  }
  return false;
}

/** True when focus is on, or inside, the dialog that currently owns the remote. */
export function focusIsWithinTopScope(currentKey: string | null | undefined): boolean {
  const scope = topModalScope();
  if (!scope) return true;
  if (!currentKey) return false;
  const el = elementOf(currentKey);
  return !!el && scope.contains(el);
}

/**
 * Put the DOM's idea of focus back on whatever the engine believes is focused.
 *
 * Two systems move focus on Android TV: this engine, and the WebView's own
 * built-in directional traversal. They disagree silently — the engine declines a
 * move it considers illegal, the WebView makes it anyway, and from then on the
 * highlight is on one control while every key press is computed from another.
 * Inside a dialog it looks exactly like a broken trap, because the engine is
 * holding the boundary correctly and the DOM has already left.
 */
export function syncDomFocus(currentKey: string | null | undefined): void {
  if (!currentKey) return;
  const el = elementOf(currentKey);
  if (!el || document.activeElement === el) return;
  el.focus({ preventScroll: true });
}

/**
 * True when focus is resting on a real, visible control.
 *
 * Being registered is not the same as being on screen. A control inside a
 * collapsed panel, a screen mid-transition, or a region hidden with
 * `display: none` still answers every question the engine asks about it, while
 * measuring zero by zero — so the user sees no highlight anywhere and the remote
 * appears dead. Treating a node with no size as no focus at all is what turns
 * that into a recoverable state.
 */
export function hasLiveFocus(currentKey: string | null | undefined): boolean {
  if (!currentKey) return false;
  return isUsableLeaf(currentKey);
}
