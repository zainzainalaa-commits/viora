import { FocusButton } from "@/lib/tv-focus";
import { isDpadPrimary } from "@/lib/platform";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import type { PlayEpisode } from "@/lib/view";

export function PickerHeader({
  meta,
  episode,
  onBack,
  onRefresh,
  refreshing = false,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useT();
  // On a television the row above the title is two controls nobody needs: the
  // remote has its own Back, and a list that just finished loading does not want
  // refreshing. Both were also the first two stops on the way in, so the
  // highlight opened on "Back" instead of on the thing the screen exists for.
  // Dropping them also lifts the title and the sources into the empty space they
  // were pushed down from.
  const onDpad = isDpadPrimary();
  return (
    // Every source screen is the same shape on a television.
    //
    // The block above the sources is otherwise as tall as whatever is in it — a
    // film's title is set larger than an episode's, an episode may carry a
    // synopsis and a film never does — so the card underneath started 22px lower
    // on one kind of title than the other, and the screen appeared to shift as
    // you moved between them. A fixed block, filled from the bottom, means the
    // sources begin on the same line every time.
    <header className={onDpad ? "flex h-[168px] flex-col justify-start gap-3" : "flex flex-col gap-3"}>
      {!onDpad && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <FocusButton
            type="button"
            onClick={onBack}
            className="group/back -ms-1 flex w-fit items-center gap-3 rounded-full py-1.5 pe-6 ps-1.5 text-[17px] font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated/70 ring-1 ring-edge-soft transition-colors group-hover/back:bg-elevated">
              <ChevronLeft size={26} strokeWidth={2.4} className="dir-icon" />
            </span>
            Back
          </FocusButton>
          {onRefresh && (
            <FocusButton
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={t("Refresh sources")}
              aria-label={t("Refresh sources")}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-edge-soft bg-elevated/70 ps-4 pe-5 text-[14px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={17} strokeWidth={2.4} className={refreshing ? "animate-spin" : ""} />
              {t("Refresh")}
            </FocusButton>
          )}
        </div>
      )}
      {episode ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ink-subtle">
            {meta.name} · Season {episode.imdbSeason ?? episode.season} · Episode {String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}
          </p>
          <h1 className="font-display text-[64px] font-medium leading-[0.96] tracking-tight text-ink">
            {episode.name || `Episode ${episode.episode}`}
          </h1>
          {episode.overview && <CollapsibleOverview text={episode.overview} fixed={onDpad} />}
        </>
      ) : (
        <>
          {meta.releaseInfo && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ink-subtle">
              {meta.releaseInfo}
              {meta.genres?.length ? ` · ${meta.genres.slice(0, 2).join(" · ")}` : ""}
            </p>
          )}
          <h1 className={`font-display font-medium leading-[0.96] tracking-tight text-ink ${onDpad ? "text-[64px]" : "text-[68px]"}`}>
            {meta.name}
          </h1>
        </>
      )}
    </header>
  );
}

function CollapsibleOverview({ text, fixed = false }: { text: string; fixed?: boolean }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setTruncated(el.scrollHeight - el.clientHeight > 2);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text, expanded]);
  return (
    <div className="mt-2 max-w-2xl">
      <p
        ref={ref}
        className={`text-[14.5px] leading-relaxed text-ink-muted ${expanded ? "" : "line-clamp-2"}`}
      >
        {text}
      </p>
      {!fixed && (truncated || expanded) && (
        <FocusButton
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-ink"
        >
          {expanded ? t("Show less") : t("View more")}
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </FocusButton>
      )}
    </div>
  );
}
