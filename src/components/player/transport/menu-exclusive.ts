import { useEffect, useRef } from "react";

/**
 * One player menu open at a time.
 *
 * Each menu in the transport keeps its own `open` flag, so moving from
 * Subtitles to Aspect ratio left both on screen, stacked — and with two focus
 * boundaries live at once the remote has no single answer to where it is. The
 * viewer opened the second one, so the first should get out of the way.
 *
 * A module-level holder rather than context: these menus are rendered from two
 * different transport implementations and a layout editor, and the rule is the
 * same in all of them.
 */
let holder: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function claim(id: string | null): void {
  if (holder === id) return;
  holder = id;
  for (const l of listeners) l(holder);
}

export function useExclusiveMenu(id: string, open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) claim(id);
    else if (holder === id) claim(null);
  }, [id, open]);

  useEffect(() => {
    const onClaim = (next: string | null) => {
      if (next !== id && openRef.current) closeRef.current();
    };
    listeners.add(onClaim);
    return () => {
      listeners.delete(onClaim);
    };
  }, [id]);

  // A menu unmounting while it holds the slot must let go of it.
  useEffect(
    () => () => {
      if (holder === id) claim(null);
    },
    [id],
  );
}
