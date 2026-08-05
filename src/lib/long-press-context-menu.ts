import { isTouchPrimary } from "@/lib/platform";

/**
 * Touch has no right-click, so every `onContextMenu` handler in the app is
 * unreachable with a finger. Rather than rewrite each call site, this listens
 * once at the document level and synthesises a real `contextmenu` event after a
 * long press — the existing React handlers then fire unchanged.
 *
 * Android WebView does emit a native contextmenu on long press, but only over
 * selectable text and links, and it arrives alongside a text-selection gesture.
 * Handling it ourselves keeps the behaviour identical across elements.
 */

const HOLD_MS = 500;
/** Past this, the finger is scrolling, not holding. */
const MOVE_TOLERANCE_PX = 10;

let installed = false;

export function installLongPressContextMenu(): () => void {
  if (installed || typeof document === "undefined" || !isTouchPrimary()) {
    return () => {};
  }
  installed = true;

  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let target: EventTarget | null = null;
  let fired = false;

  const clear = () => {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
    target = null;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      clear();
      return;
    }
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    target = e.target;
    fired = false;
    timer = window.setTimeout(() => {
      timer = null;
      if (!target) return;
      const el = target instanceof Element ? target : null;
      // Only synthesise where something is actually listening, so a long press
      // on ordinary content still does nothing.
      if (!el?.closest("[data-context-menu], [oncontextmenu]") && !hasReactHandler(el)) {
        return;
      }
      fired = true;
      navigator.vibrate?.(12);
      el?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: startY,
        }),
      );
    }, HOLD_MS);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (timer == null) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (
      Math.abs(touch.clientX - startX) > MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - startY) > MOVE_TOLERANCE_PX
    ) {
      clear();
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    // Swallow the click that follows a press we already turned into a menu.
    if (fired) {
      e.preventDefault();
      fired = false;
    }
    clear();
  };

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd);
  document.addEventListener("touchcancel", clear, { passive: true });

  return () => {
    clear();
    installed = false;
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("touchcancel", clear);
  };
}

/**
 * React attaches handlers at the root rather than to the node, so there is no
 * `oncontextmenu` property to inspect. Walk up looking for the internal props
 * bag React leaves on the DOM node instead.
 */
function hasReactHandler(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    for (const key of Object.keys(node)) {
      if (!key.startsWith("__reactProps$")) continue;
      const props = (node as unknown as Record<string, unknown>)[key];
      if (props && typeof props === "object" && "onContextMenu" in props) return true;
    }
    node = node.parentElement;
  }
  return false;
}
