import { FocusButton } from "@/lib/tv-focus";
import { GalleryHorizontal, List } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Two ways to draw an episode list, not three.
 *
 * The grid is gone: it is the layout the remote could not get out of — down
 * from the toolbar above it went back to the top of the page instead of into
 * the episodes — and it was reported from the sofa as the one place navigation
 * broke. A profile that still has it saved is shown the horizontal strip.
 */
type Layout = "list" | "strip";
type Stored = Layout | "grid";

export function EpisodeLayoutToggle({
  value,
  onChange,
}: {
  value: Stored;
  onChange: (v: Layout) => void;
}) {
  const t = useT();
  const current: Layout = value === "grid" ? "strip" : value;
  const options: { key: Layout; label: string; icon: typeof List }[] = [
    { key: "list", label: t("List view"), icon: List },
    { key: "strip", label: t("Horizontal view"), icon: GalleryHorizontal },
  ];
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-full border border-edge-soft bg-canvas/90 p-1">
      {options.map(({ key, label, icon: Icon }) => (
        <FocusButton
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={current === key}
          onClick={() => onChange(key)}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            current === key ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Icon size={15} strokeWidth={2.2} />
        </FocusButton>
      ))}
    </div>
  );
}
