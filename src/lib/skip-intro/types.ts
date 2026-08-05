export type SkipKind = "intro" | "outro" | "recap" | "ad";
export type SkipSource = "aniskip" | "introdb" | "chapters" | "adcorpus";

export type SkipSegment = {
  kind: SkipKind;
  startSec: number;
  endSec: number;
  source: SkipSource;
};
