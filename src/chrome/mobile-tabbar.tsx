import { FocusButton } from "@/lib/tv-focus";
import { useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { NAV_ITEMS, applyNavCustomization, type NavItem } from "@/chrome/nav-items";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useT } from "@/lib/i18n";
import { useParental } from "@/lib/parental";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useView, type View } from "@/lib/view";

/** Five is the most that stays tappable at 375px; the rest go in a sheet. */
const VISIBLE_TABS = 4;

/**
 * Phone navigation. The ten desktop chrome layouts all put navigation at the
 * top or in a side rail, both of which are out of thumb reach on a phone, so
 * the phone form factor bypasses them entirely and uses this instead.
 */
export function MobileTabBar() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const { setOpen: setSearchOpen } = useSearch();
  const t = useT();
  const [pinFor, setPinFor] = useState<View | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isVisible = (item: NavItem) => {
    if (item.view === "vod" && !settings.showPlaylistsTab) return false;
    if (item.hideKey && settings.hideContent[item.hideKey]) return false;
    if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
    return true;
  };

  const navigate = (item: NavItem) => {
    setSheetOpen(false);
    const needsPin = locked && (item.pinGated || (item.parentalKey && hiddenTabs[item.parentalKey]));
    if (needsPin) setPinFor(item.view);
    else setView(item.view);
  };

  const items = applyNavCustomization(NAV_ITEMS, settings.navCustomization).filter(isVisible);
  const primary = items.slice(0, VISIBLE_TABS);
  const overflow = items.slice(VISIBLE_TABS);

  return (
    <>
      <nav
        aria-hidden={chromeHidden}
        aria-label={t("chrome.navigation")}
        className={`fixed inset-x-0 bottom-0 z-[60] border-t border-edge-soft bg-canvas/95 backdrop-blur-xl transition-transform duration-300 ${
          chromeHidden ? "pointer-events-none translate-y-full" : "translate-y-0"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch justify-around px-1">
          {primary.map((item) => (
            <TabButton
              key={item.id}
              label={t(item.label)}
              active={view === item.view}
              onClick={() => navigate(item)}
            >
              {item.render(view === item.view)}
            </TabButton>
          ))}
          <TabButton label={t("common.search")} active={false} onClick={() => setSearchOpen(true)}>
            <Search size={22} strokeWidth={2.1} />
          </TabButton>
          {overflow.length > 0 && (
            <TabButton
              label={t("common.more")}
              active={overflow.some((i) => i.view === view)}
              onClick={() => setSheetOpen(true)}
            >
              <MoreHorizontal size={22} strokeWidth={2.1} />
            </TabButton>
          )}
        </div>
      </nav>

      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-end bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="max-h-[70dvh] w-full overflow-y-auto rounded-t-3xl border-t border-edge-soft bg-canvas px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge" />
            <div className="grid grid-cols-3 gap-2">
              {overflow.map((item) => (
                <FocusButton
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item)}
                  data-focusable="true"
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[12px] font-medium transition-colors ${
                    view === item.view
                      ? "bg-accent-soft text-accent"
                      : "bg-elevated/60 text-ink-muted active:bg-raised"
                  }`}
                >
                  <span className="grid h-6 w-6 place-items-center [&_svg]:h-6 [&_svg]:w-6">
                    {item.render(view === item.view)}
                  </span>
                  <span className="truncate">{t(item.label)}</span>
                </FocusButton>
              ))}
            </div>
          </div>
        </div>
      )}

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

function TabButton({
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
      aria-current={active ? "page" : undefined}
      data-focusable="true"
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10.5px] font-medium transition-colors ${
        active ? "text-accent" : "text-ink-subtle"
      }`}
    >
      <span className="grid h-6 w-6 place-items-center [&_svg]:h-[22px] [&_svg]:w-[22px]">
        {children}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </FocusButton>
  );
}
