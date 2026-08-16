import { FocusButton } from "@/lib/tv-focus";
import { APP_NAME } from "@/lib/brand";
import { useState } from "react";
import { Search } from "lucide-react";
import { VioraMark } from "@/components/icons/viora-mark";
import { ProfileBlock } from "@/chrome/siderail/profile-block";
import { CollapseToggle } from "@/chrome/sidebar/collapse-toggle";
import { TogetherButton } from "@/chrome/topbar";
import { NAV_ITEMS, applyNavCustomization, type NavItem } from "@/chrome/nav-items";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useParental } from "@/lib/parental";
import { useView, type View } from "@/lib/view";
import { ParentalPinModal } from "@/components/parental-pin-modal";


const PRIMARY_IDS = new Set(["home", "discover", "movies", "shows", "kids", "live", "vod"]);

export function SideRail() {
  const { view, setView, chromeHidden } = useView();
  const { settings } = useSettings();
  const { locked, unlock, hiddenTabs } = useParental();
  const { setOpen: setSearchOpen } = useSearch();
  const t = useT();
  const [pinFor, setPinFor] = useState<View | null>(null);
  const collapsed = settings.sidebarCollapsed;

  const navigate = (item: NavItem) => {
    if (item.parentalKey && locked && hiddenTabs[item.parentalKey]) {
      setPinFor(item.view);
      return;
    }
    setView(item.view);
  };

  const isVisible = (item: NavItem) =>
    item.id !== "kids" &&
    (item.view !== "vod" || settings.showPlaylistsTab) &&
    (!item.parentalKey || !locked || !hiddenTabs[item.parentalKey]);

  const items = applyNavCustomization(NAV_ITEMS, settings.navCustomization);
  const primary = items.filter((item) => PRIMARY_IDS.has(item.id) && isVisible(item));
  const secondary = items.filter(
    (item) => item.id !== "settings" && !PRIMARY_IDS.has(item.id) && isVisible(item),
  );
  const settingsItem = items.find((item) => item.id === "settings");

  return (
    <>
      <aside
        aria-hidden={chromeHidden}
        className={`relative z-[60] flex shrink-0 flex-col border-e border-edge-soft bg-canvas/40 transition-[opacity,width] duration-300 ${
          collapsed ? "w-[68px]" : "w-[200px]"
        } ${chromeHidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <div
          data-tauri-drag-region
          className={`relative flex h-20 shrink-0 items-end pb-3.5 ${
            collapsed ? "justify-center px-3" : "px-7"
          }`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-20"
            style={{ background: "radial-gradient(120% 78% at 24% 4%, var(--color-accent-soft), transparent 66%)" }}
          />
          <FocusButton
            type="button"
            onClick={() => setView("home")}
            className="relative flex items-center gap-2 text-accent"
            aria-label={t("chrome.harborHome")}
          >
            {/* The lockup as one piece of artwork — mark, name and signature
                together, exactly as it was drawn. It used to be the mark beside
                the name set in the interface font, which is a different thing
                wearing the same words: the letterforms, the spacing and the
                script signature all belong to the original and none of them
                survive being retypeset. Collapsed, only the mark shows. */}
            {collapsed ? (
              <VioraMark className="h-[26px] w-[26px] shrink-0" />
            ) : (
              <img
                src="/viora-lockup.png"
                alt={APP_NAME}
                draggable={false}
                className="h-[34px] w-auto shrink-0 object-contain"
              />
            )}
          </FocusButton>
        </div>

        <div className="flex-1 overflow-y-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex flex-col gap-0.5">
            {primary.map((item) => (
              <RailItem key={item.id} label={item.label} active={view === item.view} collapsed={collapsed} onClick={() => navigate(item)} />
            ))}
          </nav>

          {secondary.length > 0 && (
            <>
              <GoldRule collapsed={collapsed} />
              <nav className="flex flex-col gap-0.5">
                {secondary.map((item) => (
                  <RailItem key={item.id} label={item.label} active={view === item.view} collapsed={collapsed} onClick={() => navigate(item)} />
                ))}
              </nav>
            </>
          )}

          {settingsItem && (
            <>
              <GoldRule collapsed={collapsed} />
              <nav className="flex flex-col gap-0.5">
                <RailItem key={settingsItem.id} label={settingsItem.label} active={view === settingsItem.view} collapsed={collapsed} onClick={() => setView(settingsItem.view)} />
              </nav>
            </>
          )}
        </div>

        <div className={`relative flex flex-col gap-2 py-4 ${collapsed ? "px-2" : "px-4"}`}>
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-accent-soft), transparent)" }}
          />
          <div className={`flex items-center gap-1 ${collapsed ? "justify-center" : "justify-between"}`}>
            <FocusButton
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t("common.search")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-elevated/50 hover:text-ink"
            >
              <Search size={15} strokeWidth={1.8} />
            </FocusButton>
            {!collapsed && view !== "live" && <TogetherButton variant="ghost" popoverPlacement="above-left" />}
          </div>
          <div className={`flex ${collapsed ? "justify-center" : ""}`}>
            <CollapseToggle collapsed={collapsed} />
          </div>
          {!collapsed && <ProfileBlock onOpenSettings={() => setView("settings")} />}
        </div>
      </aside>
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

function RailItem({
  label,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const translated = t(label);
  return (
    <FocusButton
      type="button"
      onClick={onClick}
      aria-label={translated}
      title={collapsed ? translated : undefined}
      // Which entry this screen belongs to, said plainly.
      //
      // Until now the only thing distinguishing it was a colour, which is fine
      // for the eye and useless to anything that has to find it. Pressing
      // towards the rail has to land on the entry for the screen the viewer is
      // leaving — not on whichever item happens to be nearest, which from the
      // hero at the top of the page is Search.
      data-rail-active={active ? "" : undefined}
      className={`group relative flex h-10 items-center text-[16px] tracking-tight transition-colors ${
        collapsed ? "justify-center px-2" : "ps-7 pe-3 text-start"
      } ${active ? "text-accent" : "text-ink-muted hover:text-ink"}`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      <span
        aria-hidden
        className={`absolute inset-y-1 rounded-lg transition-opacity duration-200 ${
          collapsed ? "inset-x-2" : "start-2.5 end-2"
        } ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{ background: active ? "var(--color-accent-soft)" : "var(--color-elevated)" }}
      />
      {active && (
        <span
          aria-hidden
          className="absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-e-full"
          style={{ background: "var(--color-accent)", boxShadow: "0 0 12px 0 var(--color-accent)" }}
        />
      )}
      <span className="relative">{collapsed ? translated.slice(0, 1) : translated}</span>
    </FocusButton>
  );
}

function GoldRule({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      aria-hidden
      className={`my-4 h-px ${collapsed ? "mx-3" : "mx-7"}`}
      style={{ background: "linear-gradient(90deg, transparent, var(--color-accent-soft), transparent)" }}
    />
  );
}

