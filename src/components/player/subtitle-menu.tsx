import { FocusButton, FocusModal, setFocusSafely } from "@/lib/tv-focus";
import { useExclusiveMenu } from "./transport/menu-exclusive";
import { Subtitles as SubsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openStyleBar } from "@/lib/player/sub-presets";
import { useT } from "@/lib/i18n";
import { MenuBody } from "./subtitle-menu/menu-body";
import type { SubtitleMenuProps } from "./subtitle-menu/types";
import { useMenuSide } from "./menu-side";
import { Tooltip } from "./transport/tooltip";

export type { SubtitleMenuProps } from "./subtitle-menu/types";

type Props = SubtitleMenuProps;

export function SubtitleMenu(props: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { side, measure } = useMenuSide(wrap, 500);
  const propsRef = useRef(props);
  propsRef.current = props;
  const onOpenChange = props.onOpenChange;
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useExclusiveMenu("subtitles", open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);




  const handleClick = () => {
    if (!open) measure();
    setSearchOpen(false);
    setOpen((v) => !v);
  };

  /**
   * One step back, not out.
   *
   * The search is a second screen inside this panel, so Back from it belongs to
   * the panel: it puts the track list back and returns the highlight to the
   * subtitle that is playing. Only from the list itself does Back close the
   * menu and hand the remote to the film again.
   */
  const stepBack = () => {
    if (searchOpen) {
      setSearchOpen(false);
      // Once the list is back on screen — it takes a render or two, and the
      // panel's own entry point claims the highlight in the meantime.
      const id = propsRef.current.selectedId;
      const target = id ? `SUB_TRACK_${id}` : "SUB_FIND_MORE";
      // Asked more than once, on purpose.
      //
      // The list needs a render before the row exists, and the Back handler
      // places focus itself after this returns — so a single well-timed call is
      // either too early or gets overruled. It stops as soon as the highlight is
      // actually on the row.
      for (const delay of [0, 60, 150, 300, 500]) {
        window.setTimeout(() => {
          const el = document.querySelector<HTMLElement>(`[data-list-key="${target}"]`);
          if (el && document.activeElement === el) return;
          setFocusSafely(target);
        }, delay);
      }
      return;
    }
    setOpen(false);
  };

  const subSelected = props.selectedId != null;

  return (
    <div ref={wrap} className="relative">
      <Tooltip label={t("Subtitles")}>
        <FocusButton
          type="button"
          onClick={handleClick}
          aria-label={t("Subtitles")}
          // The panel standing open above it already says the menu is open; the
          // grey disc behind the icon only added a second circle to look at.
          className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            open ? "text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          <SubsIcon size={19} strokeWidth={2} />
          {subSelected && (
            <span className="absolute end-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </FocusButton>
      </Tooltip>
      {open && (
        <FocusModal
          onClose={stepBack}
          className={`absolute bottom-[calc(100%+10px)] ${side === "start" ? "start-0" : "end-0"} flex h-[380px] max-h-[70vh] w-[560px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl`}
        >
          <MenuBody
            {...props}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            onClose={() => setOpen(false)}
            onOpenStyleBar={openStyleBar}
          />
        </FocusModal>
      )}
    </div>
  );
}

export function SubtitleMenuBody(props: Props & { onClose: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return <MenuBody {...props} searchOpen={searchOpen} setSearchOpen={setSearchOpen} />;
}
