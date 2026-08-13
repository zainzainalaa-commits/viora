import { FocusButton } from "@/lib/tv-focus";
import { Wand2 } from "lucide-react";
import { useAutoSyncState, requestAutoSync } from "@/lib/player/sub-sync";
import { useT } from "@/lib/i18n";
import { Tooltip } from "../transport/tooltip";

/**
 * Check this subtitle's timing against another one — when asked.
 *
 * Not a switch. Most subtitles are already right, and measuring one costs a
 * download and a moment of work, so the viewer who thinks something is late is
 * the one who starts it.
 */
export function SyncNowButton() {
  const tr = useT();
  const sync = useAutoSyncState();
  const busy = sync.status === "analyzing";
  const done = sync.status === "synced";
  return (
    <Tooltip label={tr("Check subtitle timing")} side="bottom" align="end">
      <FocusButton
        type="button"
        onClick={() => requestAutoSync()}
        disabled={busy}
        aria-label={tr("Check subtitle timing")}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          busy || done ? "bg-accent/20 text-accent" : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        <Wand2 size={16} strokeWidth={2} className={busy ? "animate-pulse" : ""} />
      </FocusButton>
    </Tooltip>
  );
}
