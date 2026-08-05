import type { TrackInfo } from "@/lib/player/bridge";

export type SubtitleMenuProps = {
  tracks: TrackInfo[];
  selectedId: string | null;
  delaySec: number;
  onSelect: (id: string | null) => void;
  onDelay: (sec: number) => void;
  onEnterSync?: () => void;
  onAddSubtitle: (url: string, lang?: string, title?: string) => void | Promise<boolean>;
  metaImdbId?: string | null;
  metaTitle?: string | null;
  metaReleaseDate?: string | null;
  season?: number | null;
  episode?: number | null;
  useOverlayPopup?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenStyleBar?: () => void;
};

export type Group = { langKey: string; langDisplay: string; variants: TrackInfo[] };
