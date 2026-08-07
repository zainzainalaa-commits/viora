import { useRef, type ReactNode } from "react";
import { FocusContext } from "@noriginmedia/norigin-spatial-navigation";
import { ScrollProvider } from "./scroll-context";
import { useFocusRow } from "./use-focus-row";

/**
 * A horizontal carousel as the D-pad sees it.
 *
 * Two things a plain container cannot do:
 *
 *  - Remember which card you were on. Going down to the next row and back up
 *    should return to the same column; `saveLastFocusedChild` gives that once
 *    the row is a real node in the tree rather than a shape on screen.
 *
 *  - Keep the focused card visible without fighting the next keypress. The
 *    track is moved by writing scrollLeft, so the layout the engine measures is
 *    always the final one.
 */
export function FocusRow({
  focusKey,
  children,
  className,
  trackClassName,
  onFocus,
  preferredChildFocusKey,
}: {
  focusKey?: string;
  children: ReactNode;
  className?: string;
  trackClassName?: string;
  onFocus?: () => void;
  /** Where focus should enter when the row has no remembered child yet. */
  preferredChildFocusKey?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const { ref, focusKey: assigned, scroll } = useFocusRow({
    trackRef,
    focusKey,
    preferredChildFocusKey,
    onFocus,
  });

  return (
    <FocusContext.Provider value={assigned}>
      <ScrollProvider scroll={scroll}>
        <div ref={ref} className={className}>
          <div ref={trackRef} className={trackClassName} style={{ scrollBehavior: "auto" }}>
            {children}
          </div>
        </div>
      </ScrollProvider>
    </FocusContext.Provider>
  );
}
