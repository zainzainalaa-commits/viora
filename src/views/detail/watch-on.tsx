import { FocusButton } from "@/lib/tv-focus";
import type { WatchProvider } from "@/lib/providers/tmdb";
import { openUrl } from "@/lib/window";
import { useT } from "@/lib/i18n";
import { isDpadPrimary } from "@/lib/platform";

export function WatchOn({ providers }: { providers: WatchProvider[] }) {
  const t = useT();
  // Where a title streams, said once — not a row of buttons.
  //
  // Each chip opens the provider's page in a browser, which is a reasonable
  // thing to offer a mouse and a dead end on a television: the app has no
  // browser to hand it to. As focus stops they also broke the page. Measured on
  // Silo, down from Resume landed on a provider, the page scrolled by 240px to
  // show it, and down from there went straight back to Resume — the two traded
  // focus forever and the episodes below could not be reached at all.
  const chips = !isDpadPrimary();
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-subtle">{t("Watch on")}</p>
      <div className="flex flex-wrap gap-2.5">
        {providers.map((p) => {
          const Chip = chips ? FocusButton : "div";
          return (
          <Chip
            key={p.id}
            {...(chips ? { type: "button" as const, onClick: () => p.link && openUrl(p.link) } : {})}
            title={p.name}
            className="group flex h-11 items-center gap-2.5 rounded-xl border border-edge-soft bg-elevated/70 ps-2 pe-3.5 transition-[transform,background-color,border-color] duration-150 hover:border-ink-subtle hover:bg-elevated active:scale-[0.97]"
          >
            <img
              src={p.logo}
              alt={p.name}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-7 w-7 select-none rounded-md object-contain"
            />
            <span className="text-[13.5px] font-semibold tracking-tight text-ink">{p.name}</span>
          </Chip>
          );
        })}
      </div>
    </div>
  );
}
