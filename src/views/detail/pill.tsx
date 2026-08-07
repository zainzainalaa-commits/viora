import { FocusButton } from "@/lib/tv-focus";

/**
 * A pill only becomes a stop for the remote when it actually does something.
 * The metadata ones — runtime, year, certification — render as text and are
 * therefore absent from the focus tree rather than filtered out of it.
 */
export function Pill({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <FocusButton
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-full border border-edge-soft bg-canvas/85 px-3 py-1 transition-all hover:scale-[1.04] hover:border-edge hover:bg-canvas"
      >
        {children}
      </FocusButton>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-edge-soft bg-canvas/85 px-3 py-1">
      {children}
    </span>
  );
}
