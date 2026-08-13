import { FocusButton } from "@/lib/tv-focus";
import { Check } from "lucide-react";
import type { TrackInfo } from "@/lib/player/bridge";
import { useContextMenu } from "@/lib/context-menu";
import { isImageSubTrack } from "@/lib/player/sub-format";
import { saveSubtitleToDisk } from "@/lib/subtitles/save-to-disk";
import { useAutoSyncState } from "@/lib/player/sub-sync";
import { useImportedSubs } from "@/lib/player/imported-subs";
import { useT } from "@/lib/i18n";

function subExt(track: TrackInfo): string {
  const fromName = track.externalFilename?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) return fromName;
  const c = track.codec?.toLowerCase() ?? "";
  if (c.includes("ass") || c.includes("ssa")) return "ass";
  if (c.includes("vtt") || c.includes("webvtt")) return "vtt";
  return "srt";
}

/**
 * One line of the table: a box, a number, a name, where it came from, and what
 * the timing check made of it.
 */
export function VariantRow({
  track,
  index,
  selected,
  primary,
  onPick,
}: {
  track: TrackInfo;
  /** Position in the visible list, shown so a viewer can say "the third one". */
  index: number;
  selected: boolean;
  /** Where the remote should land when the menu opens. */
  primary?: boolean;
  onPick: () => void;
}) {
  const tr = useT();
  const { open } = useContextMenu();
  const imported = useImportedSubs();
  const sync = useAutoSyncState();
  const isImported = !!track.title && imported.has(track.title);
  const sourceLabel = isImported ? tr("Imported") : track.external ? tr("External") : tr("Embedded");
  const titleText =
    track.title?.trim() || (track.external ? tr("External subtitle") : tr("Embedded track"));

  // The timing column only speaks about the track that was actually measured.
  const measured = sync.trackId === track.id && (sync.status === "synced" || sync.status === "declined");
  const pct = measured ? Math.round(sync.confidence * 100) : null;
  const good = measured && sync.status === "synced" && sync.confidence >= 0.75;

  return (
    <FocusButton
      onClick={onPick}
      data-focus-primary={primary ? "" : undefined}
      // Keep the row the remote is on fully inside the list.
      //
      // The focus system reveals a control that has left the *window*; a row
      // that has only left its own scrolling box is still on screen, so nothing
      // scrolls. Measured here: the fifth track sat half under the search field,
      // and because its rectangle overlapped the field, pressing down found no
      // candidate below and the list dead-ended.
      onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
      onContextMenu={(e) =>
        open(e, {
          kind: "subtitle",
          label: titleText,
          download: track.url
            ? () =>
                saveSubtitleToDisk(track.url!, {
                  title: track.title || titleText,
                  lang: track.lang,
                  format: subExt(track),
                  label: tr("Subtitle"),
                })
            : undefined,
        })
      }
      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors ${
        selected
          ? "bg-elevated ring-1 ring-edge"
          : isImported
            ? "bg-accent/[0.07] ring-1 ring-accent/30 hover:bg-accent/10"
            : "hover:bg-canvas/55"
      }`}
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] ${
          selected ? "bg-accent text-canvas" : "bg-raised ring-1 ring-edge-soft"
        }`}
        aria-hidden
      >
        {selected ? <Check size={11} strokeWidth={3} /> : null}
      </span>

      <span className="w-4 shrink-0 text-[11.5px] tabular-nums text-ink-subtle">{index}</span>

      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
        {titleText}
        {isImageSubTrack(track) && (
          <span className="ms-2 text-[10.5px] font-normal text-ink-subtle">
            {tr("Position and size only")}
          </span>
        )}
      </span>

      <span
        className={`w-[86px] shrink-0 text-center text-[9.5px] font-bold uppercase tracking-[0.1em] ${
          track.external ? "text-sky-200" : "text-emerald-200"
        }`}
      >
        <span
          className={`rounded px-1.5 py-0.5 ring-1 ${
            track.external
              ? "bg-sky-400/15 ring-sky-400/30"
              : "bg-emerald-400/15 ring-emerald-400/30"
          }`}
        >
          {sourceLabel}
        </span>
      </span>

      <span className="flex w-[74px] shrink-0 items-center justify-end gap-1.5 text-[11.5px] tabular-nums">
        {pct === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <>
            <span className={good ? "text-emerald-300" : "text-amber-300"}>{pct}%</span>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${good ? "bg-emerald-400" : "bg-amber-400"}`}
            />
          </>
        )}
      </span>
    </FocusButton>
  );
}
