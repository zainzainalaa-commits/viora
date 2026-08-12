import { FocusButton } from "@/lib/tv-focus";
import { Home } from "lucide-react";
import { togglePinnedCatalog, useIsPinned, type PinnedSource } from "@/lib/pinned-catalogs";
import { useT } from "@/lib/i18n";
import { isDpadPrimary } from "@/lib/platform";

export function PinHomeButton({
  id,
  source,
  name,
  params,
}: {
  id: string;
  source: PinnedSource;
  name: string;
  params: Record<string, string>;
}) {
  const t = useT();
  const pinned = useIsPinned(id);

  // Not a stop on a remote.
  //
  // A 28px circle beside a row's title, whose whole job is to pin that row to
  // Home — the same class of thing as the row title that opens a grid, and the
  // same result: it sits level with the heading, catches the column on the way
  // past, and shows a focus ring wider than the button it is drawn around.
  // Which rows appear on Home is a decision for a screen with a pointer.
  if (isDpadPrimary()) return null;

  return (
    <FocusButton
      type="button"
      onClick={() => togglePinnedCatalog({ id, source, name, params })}
      aria-pressed={pinned}
      aria-label={pinned ? t("Remove from Home") : t("Add to Home Screen")}
      title={pinned ? t("Remove from Home") : t("Add to Home Screen")}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        pinned
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-edge-soft bg-canvas/40 text-ink-subtle hover:border-edge hover:text-ink-muted"
      }`}
    >
      <Home size={14} strokeWidth={2.2} />
    </FocusButton>
  );
}
