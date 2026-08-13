import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useSettings } from "@/lib/settings";
import { closeStyleBar, useStyleBarOpen } from "@/lib/player/sub-presets";
import { useT } from "@/lib/i18n";
import { BoldToggle, ColorRow, FontMenu, SizeStepper } from "./sub-style-bar/controls";
import { AdvancedMenu } from "./sub-style-bar/advanced-menu";
import { LooksCluster } from "./sub-style-bar/looks-cluster";

const IDLE_MS = 7000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const GROUP = "flex h-9 items-center overflow-hidden rounded-[10px] bg-raised";

export function SubStyleBar() {
  const t = useT();
  const open = useStyleBarOpen();
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStyleBar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let timer = window.setTimeout(closeStyleBar, IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(closeStyleBar, IDLE_MS);
    };
    window.addEventListener("pointermove", bump);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [open]);

  if (!open) return null;

  return (
    // A scope, not a floating row of buttons.
    //
    // It used to be a plain div over the video, which left the remote free to
    // walk out of it into the transport underneath while the bar was still up,
    // and Back had nothing to close. As a modal the D-pad stays among these
    // controls, Back closes the bar, and focus returns to whatever opened it.
    <FocusModal
      onClose={closeStyleBar}
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-7 pt-[60px] animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div
        role="toolbar"
        aria-label={t("Subtitle appearance")}
        className="pointer-events-auto flex max-w-[calc(100vw-56px)] flex-wrap items-center justify-center gap-1.5 rounded-[14px] border border-edge bg-elevated px-1.5 py-1.5 shadow-[0_18px_44px_-22px_rgba(0,0,0,0.85)]"
      >
        <div className={GROUP}>
          <FontMenu value={settings.subFontFamily} fonts={settings.customFonts} onChange={(f) => update({ subFontFamily: f })} />
          <span aria-hidden className="h-6 w-px bg-edge-soft" />
          <SizeStepper value={settings.subFontSize} onChange={(n) => update({ subFontSize: clamp(n, 16, 120) })} />
          <span aria-hidden className="h-6 w-px bg-edge-soft" />
          <BoldToggle on={settings.subBold} onToggle={() => update({ subBold: !settings.subBold })} />
        </div>

        <div className={GROUP}>
          <ColorRow value={settings.subFontColor} onChange={(c) => update({ subFontColor: c })} />
        </div>

        <div className={GROUP}>
          <LooksCluster settings={settings} update={update} />
        </div>

        <AdvancedMenu />

        <FocusButton
          type="button"
          onClick={closeStyleBar}
          aria-label={t("Done")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
        >
          <X size={16} strokeWidth={2.2} />
        </FocusButton>
      </div>
    </FocusModal>
  );
}
