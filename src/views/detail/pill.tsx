import { FocusButton } from "@/lib/tv-focus";
import { isDpadPrimary } from "@/lib/platform";

/**
 * A pill is a label, and on a remote it stays one.
 *
 * The ones that do something open a genre catalogue, and they sit in the middle
 * of the line that reads "2017 · IMDb 7.4 · 133 min · Action · Adventure" —
 * where the eye is reading facts, not looking for controls. Standing on one puts
 * a bright frame around a word in a sentence, and every trip down the page has
 * to step through three of them. The catalogues they open are what the Movies
 * and Shows screens are for.
 *
 * The metadata ones — runtime, year, certification — were never in the focus
 * tree to begin with: they render as text.
 */
export function Pill({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (onClick && !isDpadPrimary()) {
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
