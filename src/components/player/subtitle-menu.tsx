import { FocusButton, FocusModal } from "@/lib/tv-focus";
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
    setOpen((v) => !v);
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
          onClose={() => setOpen(false)}
          className={`absolute bottom-[calc(100%+10px)] ${side === "start" ? "start-0" : "end-0"} flex h-[380px] max-h-[70vh] w-[560px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl`}
        >
          <MenuBody {...props} onClose={() => setOpen(false)} onOpenStyleBar={openStyleBar} />
        </FocusModal>
      )}
    </div>
  );
}

export function SubtitleMenuBody(props: Props & { onClose: () => void }) {
  return <MenuBody {...props} />;
}
