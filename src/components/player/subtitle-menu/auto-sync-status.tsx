import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAutoSyncState } from "@/lib/player/sub-sync";

/**
 * What the automatic sync did, said once and briefly.
 *
 * The viewer's question is only ever "are these subtitles right?", so the answer
 * leads: analysing, or corrected, or declined. The evidence — which track was
 * used as the clock, how far it moved, how sure it is — sits underneath in small
 * type for the people who want it, and the row is plain text, never a focus
 * stop, so the remote still walks straight from the header into the list.
 */
export function AutoSyncStatus() {
  const tr = useT();
  const sync = useAutoSyncState();

  if (sync.status === "idle" || sync.status === "unavailable") return null;

  if (sync.status === "analyzing") {
    return (
      <div className="flex items-center gap-2 border-b border-edge-soft bg-canvas/30 px-4 py-2 text-[11.5px] text-ink-muted">
        <Loader2 size={13} strokeWidth={2.2} className="shrink-0 animate-spin" />
        <span>{tr("Checking subtitle timing…")}</span>
      </div>
    );
  }

  if (sync.status === "declined") {
    return (
      <div className="flex items-center gap-2 border-b border-edge-soft bg-canvas/30 px-4 py-2 text-[11.5px] text-ink-muted">
        <TriangleAlert size={13} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
        <span>{tr("Timing could not be checked confidently — adjust it by hand from the sync bar.")}</span>
      </div>
    );
  }

  // Nothing moved, so say so. "Corrected" over a correction of two hundredths
  // of a second claims work that was not done, and a viewer who came here
  // because the subtitles look late deserves to know the check found them level
  // rather than to think it has already been dealt with.
  const changed = Math.abs(sync.offsetSec) >= 0.15 || sync.driftCorrected;
  const seconds = `${sync.offsetSec >= 0 ? "+" : "−"}${Math.abs(sync.offsetSec).toFixed(2)}s`;
  const detail = [
    sync.referenceLabel ? tr("matched to {ref}", { ref: sync.referenceLabel }) : null,
    changed ? seconds : null,
    sync.driftCorrected ? tr("drift corrected") : null,
    tr("{pct}% confident", { pct: Math.round(sync.confidence * 100) }),
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2 border-b border-edge-soft bg-canvas/30 px-4 py-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-canvas">
        <Check size={9} strokeWidth={3} />
      </span>
      <span className="text-[11.5px] font-semibold text-ink">
        {changed ? tr("Timing corrected") : tr("Timing already matches")}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-ink-subtle">
        {detail.join(" · ")}
      </span>
    </div>
  );
}
