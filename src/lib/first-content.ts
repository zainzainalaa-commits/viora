/**
 * The signal that the first screen has content worth showing.
 *
 * main.tsx keeps the boot screen up until this fires, so the viewer never sees
 * an empty library filling itself in. It is announced once per launch: a later
 * navigation has its own loading states and does not put the mark back.
 */
export const FIRST_CONTENT_EVENT = "viora:first-content";

/**
 * How long the boot screen may stay up waiting.
 *
 * The rows come from whichever catalogues are installed, and a television that
 * has just woken can be ahead of its own network. Without a ceiling, a slow or
 * unreachable catalogue would hold the app closed rather than merely late.
 * Eight seconds is long enough for a catalogue that is answering and short
 * enough that one which is not still lets the viewer in — to an empty library,
 * which is at least an app.
 */
export const FIRST_CONTENT_TIMEOUT_MS = 8000;

let announced = false;

export function announceFirstContent(): void {
  if (announced || typeof window === "undefined") return;
  announced = true;
  window.dispatchEvent(new Event(FIRST_CONTENT_EVENT));
}
