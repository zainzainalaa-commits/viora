import { useT } from "@/lib/i18n";

export function NewBadge() {
  const t = useT();
  return (
    <span className="relative inline-flex shrink-0 items-center overflow-hidden rounded-[5px] border border-accent/30 bg-accent/12 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.14em] text-accent">
      <span className="relative z-10">{t("New")}</span>
      <span className="animate-shimmer pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-accent/22 to-transparent" />
    </span>
  );
}

export function UpcomingBadge() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
      {t("Upcoming")}
    </span>
  );
}

export function FillerBadge() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
      {t("Filler")}
    </span>
  );
}
