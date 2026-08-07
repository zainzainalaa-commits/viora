import { useCallback, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { useFocusableControl } from "./use-focusable-control";

/**
 * One selectable item in a row or grid.
 *
 * Cards are built by more than forty different components — a watchlist card, an
 * episode row, a channel tile — and they agree on nothing except that each one
 * is a single thing you can pick. So the registration boundary is the cell, not
 * the markup inside it: one cell is one stop for the remote, whatever it happens
 * to contain.
 *
 * This is not the DOM scanning the old engine did. Nothing is discovered and
 * nothing is judged; the row states that its children are items, and the search
 * for something to click is scoped to a single card rather than the document.
 *
 * Enter runs the card's primary action. Anything secondary belongs on the long
 * press, which is where the context menu already lives.
 */
export function FocusCell({
  children,
  style,
  className,
  onSelect,
  onContextMenu,
  ref: externalRef,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Overrides the click-the-card default when a card knows its own action. */
  onSelect?: () => void;
  onContextMenu?: () => void;
  /** Callers that already observe this element keep their own handle on it. */
  ref?: Ref<HTMLDivElement>;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  const activate = useCallback(() => {
    if (onSelect) {
      onSelect();
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    // The card's own root is usually the control; when it wraps one, take the
    // first real control inside it.
    const control =
      box.querySelector<HTMLElement>('a[href], button:not([disabled]), [role="button"]') ?? box;
    control.click();
  }, [onSelect]);

  const contextMenu = useCallback(() => {
    if (onContextMenu) {
      onContextMenu();
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    const target = box.querySelector<HTMLElement>('a[href], button, [role="button"]') ?? box;
    const rect = target.getBoundingClientRect();
    // The app already has a long-press context menu bridge listening for this.
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  }, [onContextMenu]);

  const { ref, focusProps } = useFocusableControl({
    onSelect: activate,
    onLongPress: contextMenu,
  });

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      boxRef.current = node;
      (ref as { current: HTMLElement | null }).current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef) (externalRef as { current: HTMLDivElement | null }).current = node;
    },
    [ref, externalRef],
  );

  return (
    <div
      ref={attach}
      style={style}
      className={className}
      // A cell is a single choice, so it reads as one to assistive tech too.
      role="gridcell"
      // A plain div cannot take programmatic focus without this, and without
      // real DOM focus there is no focus ring — the tree would be moving
      // correctly while the screen showed nothing. -1 keeps it out of the Tab
      // order, which belongs to the mouse and keyboard, not the remote.
      tabIndex={-1}
      {...focusProps}
    >
      {children}
    </div>
  );
}
