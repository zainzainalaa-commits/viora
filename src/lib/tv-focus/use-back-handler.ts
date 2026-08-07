import { useEffect, useRef } from "react";
import { findTopOverlay } from "./keys";

/**
 * Back is deliberately not part of the focus tree.
 *
 * Spatial navigation answers "which control is left of this one"; Back answers
 * "what does this screen mean by leaving". Norigin owns the first and takes no
 * position on the second, so it lives here as its own stack.
 *
 * Handlers are consulted innermost-first: an open modal closes itself before
 * the page beneath it pops a view. A handler returns true when it has consumed
 * the press, which is what stops a single Back from unwinding two levels.
 */

const BACK_KEYS = new Set(["Escape", "Esc", "BrowserBack", "GoBack", "Back"]);
// Android TV delivers the remote's back button as a key code, not a name.
const BACK_KEYCODES = new Set([27, 4, 461]);

type BackHandler = () => boolean;

const stack: BackHandler[] = [];
let listening = false;

function isEditable(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Runs the stack innermost-first. True when something consumed the press. */
function runStack(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]()) return true;
  }
  return false;
}

/**
 * Closes an open dialog that never registered a Back handler.
 *
 * Most of this app's dialogs came from the desktop client, where closing is
 * Escape and nobody thought about a remote. Fifty-six of the seventy-six already
 * listen for Escape; what none of them do is listen for Android's Back, which
 * never reaches the page as a key event at all. Synthesising the key they do
 * understand reaches all of them at once, without editing seventy-six files and
 * without inventing a second convention for closing things.
 *
 * When a dialog is on screen the press is always reported as handled, even if
 * nothing closed. Declining hands the press to Android, whose answer is to quit
 * the app — and quitting from behind an open dialog is the one outcome that is
 * certainly wrong. The user can still reach that dialog's own close control,
 * because focus is trapped inside it.
 */
function closeTopOverlay(): boolean {
  const overlay = findTopOverlay();
  if (!overlay) return false;

  const target = document.activeElement instanceof HTMLElement ? document.activeElement : overlay;
  for (const type of ["keydown", "keyup"] as const) {
    target.dispatchEvent(
      new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }),
    );
  }
  return true;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!BACK_KEYS.has(event.key) && !BACK_KEYCODES.has(event.keyCode)) return;

  // Escape inside a text field means "give up on this field", and the field
  // itself handles that. Intercepting it would trap the user in the search box.
  if (isEditable(event.target)) return;

  if (runStack()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

declare global {
  interface Window {
    /** Called by MainActivity on hardware Back. True means the app handled it. */
    __vioraBack?: () => boolean;
  }
}

function ensureListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, { capture: true });

  // Android does not deliver its Back key to the page as a key event — it goes
  // to the Activity, which by default asks the WebView to go back in *browser*
  // history. This is a single-page app that never pushes history entries, so
  // that check is always false and Back quit the app from anywhere, including a
  // details page one level deep.
  //
  // Exposing the stack lets the native side ask the app first and only exit when
  // nothing here wants the press.
  window.__vioraBack = () => {
    // Never decline while a field has focus. Declining hands the press back to
    // Android, and Android's answer is to close the app — so Back from the
    // search box quit rather than leaving the search. Stepping out of the field
    // first gives the press somewhere sensible to go, and the press is always
    // reported as handled so typing can never be an exit route.
    if (isEditable(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
      runStack();
      return true;
    }
    if (runStack()) return true;
    return closeTopOverlay();
  };
}

/**
 * Registers a Back handler for as long as the component is mounted.
 *
 * The ref indirection matters: handlers usually close over state that changes
 * every render, and re-subscribing on each change would reorder the stack and
 * let an inner modal fall behind the page under it.
 */
export function useBackHandler(handler: BackHandler, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    ensureListening();
    const entry: BackHandler = () => latest.current();
    stack.push(entry);
    return () => {
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [enabled]);
}
