import { FocusButton } from "@/lib/tv-focus";
import { Check, Languages, Loader2, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n";
import { AutoSyncStatus } from "./auto-sync-status";
import { SyncNowButton } from "./sync-now-button";
import { SearchSection } from "./search-section";
import { VariantRow } from "./variant-row";
import type { SubtitleMenuProps } from "./types";
import { groupByLang, isVeryNewRelease } from "./utils";
import { listKeyNav } from "./list-nav";

type SourceFilter = "all" | "embedded" | "external";
const ALL_LANGS = "__all__";

export function MenuBody(
  props: SubtitleMenuProps & {
    onClose: () => void;
    /**
     * Owned above, because Back has to be able to undo it.
     *
     * Opening the search replaces the track list with a second screen inside
     * the same panel, and the remote's back button belongs to whoever owns the
     * panel — so the flag lives there and comes down as a prop.
     */
    searchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
  },
) {
  const tr = useT();
  const { tracks, selectedId, onSelect, onClose, metaReleaseDate, onOpenStyleBar, searchOpen, setSearchOpen } = props;
  const groups = useMemo(() => groupByLang(tracks), [tracks]);
  const [searchSettled, setSearchSettled] = useState(false);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  useEffect(() => {
    if (tracks.length > 0) return;
    setSearchSettled(false);
    const timer = setTimeout(() => setSearchSettled(true), 9000);
    return () => clearTimeout(timer);
  }, [tracks.length]);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveLang(null);
      return;
    }
    if (activeLang === ALL_LANGS) return;
    if (!activeLang || !groups.some((g) => g.langKey === activeLang)) {
      const sel = groups.find((g) => g.variants.some((v) => v.id === selectedId));
      setActiveLang(sel?.langKey ?? groups[0].langKey);
    }
  }, [groups, activeLang, selectedId]);

  const veryNewMovie = useMemo(() => isVeryNewRelease(metaReleaseDate), [metaReleaseDate]);
  const allLangs = activeLang === ALL_LANGS;
  const activeGroup = useMemo(
    () => groups.find((g) => g.langKey === activeLang) ?? null,
    [groups, activeLang],
  );
  const visibleVariants = useMemo(() => {
    const list = allLangs ? tracks : (activeGroup?.variants ?? []);
    return list.filter((t) => {
      if (sourceFilter === "embedded" && t.external) return false;
      if (sourceFilter === "external" && !t.external) return false;
      return true;
    });
  }, [allLangs, tracks, activeGroup, sourceFilter]);

  const totalEmbedded = tracks.filter((t) => !t.external).length;
  const totalExternal = tracks.filter((t) => t.external).length;
  const offSelected = selectedId == null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-edge-soft px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13.5px] font-semibold text-ink">{tr("Subtitles")}</span>
          {tracks.length > 0 && (
            <span className="text-[11.5px] tabular-nums text-ink-subtle">
              {tracks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <SyncNowButton />

          {/* ── Style bar button ── */}
          {onOpenStyleBar && (
            <FocusButton
              type="button"
              onClick={() => {
                onOpenStyleBar();
                onClose();
              }}
              aria-label={tr("Subtitle appearance")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </FocusButton>
          )}

          <FocusButton
            onClick={onClose}
            aria-label={tr("Close")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </FocusButton>
        </div>
      </header>

      <AutoSyncStatus />

      {/* ── Band one: subtitles on or off, and which language ──
           A row, not a column down the side. The panel is 560 wide and the
           table wants all of it, and a sidebar is one more thing for the remote
           to walk sideways into on its way anywhere. */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-edge-soft bg-canvas/20 px-3 py-2 [&>button]:shrink-0">
        <FocusButton
          onClick={() => {
            if (offSelected) return;
            onSelect(null);
            onClose();
          }}
          disabled={offSelected}
          onFocus={(e) => e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" })}
          className={`flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-semibold transition-colors ${
            offSelected ? "text-ink-subtle" : "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
              offSelected ? "bg-raised text-ink-subtle" : "bg-accent text-canvas"
            }`}
          >
            {offSelected ? null : <Check size={9} strokeWidth={3} />}
          </span>
          {offSelected ? tr("Off") : tr("On")}
        </FocusButton>

        {groups.length > 0 && <span aria-hidden className="h-5 w-px shrink-0 bg-edge-soft" />}

        {groups.length > 1 && (
          <FocusButton
            onClick={() => setActiveLang(ALL_LANGS)}
            onFocus={(e) => e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" })}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
              allLangs
                ? "bg-elevated text-ink ring-1 ring-edge"
                : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
            }`}
          >
            <Languages size={13} strokeWidth={2} className="shrink-0" />
            {tr("All")}
            <span className="text-[10.5px] tabular-nums text-ink-subtle">{tracks.length}</span>
          </FocusButton>
        )}

        {groups.map((g) => {
          const isActive = activeLang === g.langKey;
          const hasSelected = g.variants.some((v) => v.id === selectedId);
          return (
            <FocusButton
              key={g.langKey}
              onClick={() => setActiveLang(g.langKey)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" })}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors ${
                isActive
                  ? "bg-elevated text-ink ring-1 ring-edge"
                  : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
              }`}
            >
              <Flag language={g.langDisplay} size="sm" showLabel={false} />
              <span className="truncate font-medium">{g.langDisplay}</span>
              {hasSelected && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
              <span className="text-[10.5px] tabular-nums text-ink-subtle">{g.variants.length}</span>
            </FocusButton>
          );
        })}
      </div>

      {/* ── Band two: everything about the tracks themselves ── */}
      <div className="flex min-h-0 flex-1">
        {/* Track list section */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={listKeyNav}>
          {!searchOpen && tracks.length > 0 && (activeGroup || allLangs) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-edge-soft bg-canvas/15 px-3 py-2">
              <Tab active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
                {tr("All")} <Count value={tracks.length} />
              </Tab>
              <Tab
                active={sourceFilter === "embedded"}
                onClick={() => setSourceFilter("embedded")}
                disabled={totalEmbedded === 0}
              >
                {tr("Embedded")} <Count value={totalEmbedded} />
              </Tab>
              <Tab
                active={sourceFilter === "external"}
                onClick={() => setSourceFilter("external")}
                disabled={totalExternal === 0}
              >
                {tr("External")} <Count value={totalExternal} />
              </Tab>
            </div>
          )}

          {searchOpen ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <SearchSection {...props} />
            </div>
          ) : (
            // `min-h-0`, or this refuses to shrink below its content: the list
            // grows past the panel and the footer is painted over the last row.
            // Measured, the search field started 17px above the bottom of row
            // five — and an overlapping candidate is not "below", so pressing
            // down on the last subtitle went nowhere.
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tracks.length === 0 ? (
                <EmptyState searchSettled={searchSettled} veryNewMovie={veryNewMovie} />
              ) : visibleVariants.length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-ink-muted">
                  {tr("No tracks match this filter.")}
                </p>
              ) : (
                <div className="flex flex-col gap-1 p-2">
                  <div className="flex items-center gap-3 px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                    <span className="w-[18px] shrink-0" />
                    <span className="w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {allLangs
                        ? tr("Subtitles")
                        : tr("Subtitles ({lang})", { lang: activeGroup?.langDisplay ?? "" })}
                    </span>
                    <span className="w-[86px] shrink-0 text-center">{tr("Type")}</span>
                    <span className="w-[74px] shrink-0 text-end">{tr("Timing")}</span>
                  </div>
                  {visibleVariants.map((t, i) => (
                    <VariantRow
                      key={t.id}
                      track={t}
                      index={i + 1}
                      rowKey={`SUB_TRACK_${t.id}`}
                      selected={t.id === selectedId}
                      // The track you are watching is the one the remote should
                      // start on; with none picked yet, the top of the list.
                      primary={
                        selectedId
                          ? t.id === selectedId
                          : i === 0
                      }
                      onPick={() => {
                        onSelect(t.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-stretch border-t border-edge-soft">
            <FocusButton
              onClick={() => setSearchOpen(!searchOpen)}
              data-list-row=""
              data-list-key="SUB_FIND_MORE"
              focusKey="SUB_FIND_MORE"
              className="m-2 flex flex-1 items-center gap-2.5 rounded-lg bg-canvas/50 px-3.5 py-2.5 text-start text-[12.5px] text-ink-muted ring-1 ring-edge-soft transition-colors hover:bg-canvas/70 hover:text-ink"
            >
              <SearchIcon size={14} strokeWidth={2.2} className="shrink-0" />
              {searchOpen ? tr("Hide search") : tr("Find more subtitles online…")}
            </FocusButton>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function Tab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FocusButton
      onClick={onClick}
      disabled={disabled}
      // No pill around it. These read as a line of headings, and a filled
      // capsule on the active one is a second shape competing with the ring
      // that focus already draws.
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition-colors disabled:opacity-40 ${
        active ? "font-bold text-ink" : "font-semibold text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </FocusButton>
  );
}

function Count({ value }: { value: number }) {
  return <span className="text-[11.5px] tabular-nums text-ink-subtle">{value}</span>;
}

function EmptyState({ searchSettled, veryNewMovie }: { searchSettled: boolean; veryNewMovie: boolean }) {
  const tr = useT();
  if (!searchSettled) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-6 text-[13.5px] text-ink-muted">
        <Loader2 size={14} className="animate-spin text-ink-subtle" />
        {tr("Looking for subtitles…")}
      </div>
    );
  }
  if (veryNewMovie) {
    return (
      <div className="flex flex-col gap-1.5 px-5 py-6 text-[13.5px] leading-snug text-ink-muted">
        <span className="text-[14px] font-semibold text-ink">{tr("Movie's too new")}</span>
        <span>{tr("Subtitles haven't been published yet. Try search below or check back in a few days.")}</span>
      </div>
    );
  }
  return (
    <p className="px-5 py-6 text-[13.5px] text-ink-muted">
      {tr("No subtitles found yet. Try the search at the bottom.")}
    </p>
  );
}
