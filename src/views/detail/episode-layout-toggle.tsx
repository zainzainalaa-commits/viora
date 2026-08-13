import { FocusButton } from "@/lib/tv-focus";
import { GalleryHorizontal, LayoutGrid, List } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isDpadPrimary } from "@/lib/platform";

type Layout = "list" | "strip" | "grid";

export function EpisodeLayoutToggle({
  value,
  onChange,
}: {
  value: Layout;
  onChange: (v: Layout) => void;
}) {
  const t = useT();
  // Not offered on a television.
  //
  // Three ways to draw the same list, three focus stops in the middle of the
  // toolbar, and — reported from the sofa and matching what the walk measured —
  // the one place in that toolbar the remote could not get out of downwards.
  // The layout a viewer already chose still applies; only the switch is gone.
  if (isDpadPrimary()) return null;
  const options: { key: Layout; label: string; icon: typeof List }[] = [
    { key: "list", label: t("List view"), icon: List },
    { key: "strip", label: t("Horizontal view"), icon: GalleryHorizontal },
    { key: "grid", label: t("Grid view"), icon: LayoutGrid },
  ];
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-full border border-edge-soft bg-canvas/90 p-1">
      {options.map(({ key, label, icon: Icon }) => (
        <FocusButton
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            value === key ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Icon size={15} strokeWidth={2.2} />
        </FocusButton>
      ))}
    </div>
  );
}
