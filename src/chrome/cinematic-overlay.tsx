import { FocusButton } from "@/lib/tv-focus";
import { APP_NAME } from "@/lib/brand";
import { useState } from "react";
import { Search } from "lucide-react";
import { VioraMark } from "@/components/icons/viora-mark";
import { TogetherButton } from "@/chrome/topbar";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";
import { useParental } from "@/lib/parental";
import { useView, type View } from "@/lib/view";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { OverflowNav, type NavEntry } from "@/chrome/nav-overflow";
import { NAV_ITEMS, applyNavCustomization, type NavItem } from "@/chrome/nav-items";
import { ProfileChipCompact } from "@/chrome/cinematic-overlay/profile-chip-compact";


export function CinematicOverlay() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const { setOpen: setSearchOpen } = useSearch();
  const t = useT();
  const [pinFor, setPinFor] = useState<View | null>(null);

  const themePreset =
    settings.theme.preset !== "custom"
      ? getThemeById(settings.theme.preset)
      : null;
  const customMark = themePreset?.logo?.mark ?? null;

  const navigate = (item: NavItem) => {
    if (item.parentalKey && locked && hiddenTabs[item.parentalKey]) {
      setPinFor(item.view);
      return;
    }
    setView(item.view);
  };

  const navEntries: NavEntry[] = applyNavCustomization(
    NAV_ITEMS,
    settings.navCustomization,
  )
    .filter(
      (item) =>
        item.id !== "settings" &&
        item.id !== "kids" &&
        (item.view !== "vod" || settings.showPlaylistsTab) &&
        (!item.hideKey || !settings.hideContent[item.hideKey]) &&
        (!item.parentalKey || !locked || !hiddenTabs[item.parentalKey]),
    )
    .map((item) => {
      const active = view === item.view;
      const label = t(item.label);
      return {
        key: item.id,
        label,
        active,
        onSelect: () => navigate(item),
        node: (
          <FocusButton
            type="button"
            onClick={() => navigate(item)}
            className={`relative h-9 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors ${
              active ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-white/15 ring-1 ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_-2px_rgba(0,0,0,0.3)] backdrop-blur-md"
              />
            )}
            {label}
          </FocusButton>
        ),
      };
    });

  return (
    <>
      <header
        aria-hidden={chromeHidden}
        className={`fixed inset-x-0 top-0 z-[60] flex h-24 items-start px-6 pt-3 transition-opacity duration-300 ${
          chromeHidden ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
        <div
          data-tauri-drag-region
          className="pointer-events-auto relative flex h-14 w-full items-center gap-2 px-1"
        >
          <FocusButton
            type="button"
            onClick={() => setView("home")}
            className="flex shrink-0 items-center gap-2 text-ink"
            aria-label={t("chrome.harborHome")}
          >
            {customMark ? (
              <img
                src={customMark}
                alt=""
                draggable={false}
                className="h-7 w-7 object-contain"
              />
            ) : (
              <VioraMark className="h-7 w-7" />
            )}
            {themePreset?.id === "crunch" && (
              <span className="font-display text-[22px] font-bold leading-none text-ink">
                {APP_NAME}
              </span>
            )}
          </FocusButton>

          <div className="mx-1 h-6 w-px shrink-0 bg-white/15" />

          <OverflowNav
            entries={navEntries}
            gapPx={2}
            className="flex-1"
            moreClassName="relative flex h-9 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
          />

          <div className="ms-2 flex shrink-0 items-center gap-1">
            {view !== "live" && (
              <TogetherButton variant="ghost" connectStyle="tab" />
            )}
            <IconBtn
              onClick={() => setSearchOpen(true)}
              label={t("common.search")}
              active={false}
            >
              <Search size={15} strokeWidth={2.2} />
            </IconBtn>
            <ProfileChipCompact
              onOpenSettings={() => setView("settings")}
              settingsActive={view === "settings"}
            />
          </div>
        </div>
      </header>
      {pinFor !== null && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const v = pinFor;
              setPinFor(null);
              if (v) setView(v);
            },
            onCancel: () => setPinFor(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}

function IconBtn({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <FocusButton
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-white/20 text-ink ring-1 ring-white/25"
          : "text-ink-muted hover:bg-white/12 hover:text-ink"
      }`}
    >
      {children}
    </FocusButton>
  );
}

