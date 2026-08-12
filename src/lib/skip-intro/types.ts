/**
 * "flagged" is a scene the source marks as cut for content reasons, which is a
 * different promise from an intro or a credit roll: skipping it removes part of
 * the film, so it is only ever offered when the viewer has asked for it.
 */
export type SkipKind = "intro" | "outro" | "recap" | "ad" | "flagged";
export type SkipSource = "aniskip" | "introdb" | "chapters" | "adcorpus" | "cinemana" | "albox";

export type SkipSegment = {
  kind: SkipKind;
  startSec: number;
  endSec: number;
  source: SkipSource;
};
