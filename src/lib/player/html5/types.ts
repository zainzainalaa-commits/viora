import type { SubCue } from "@/lib/subtitles/parser";

export type SubTrack = {
  id: string;
  url: string;
  lang?: string;
  title?: string;
  external: boolean;
  cues: SubCue[] | null;
  loading: boolean;
};

export type AudioTrackList = {
  length: number;
  [index: number]: { id?: string; label: string; language: string; enabled: boolean };
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};
