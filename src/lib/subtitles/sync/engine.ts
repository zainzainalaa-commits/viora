import type { SubCue } from "../parser";
import { alignEvents, type Anchor } from "./align";
import { classifyCues, dialogueOnly, firstDialogueIndex, type ClassifiedCue } from "./classify";
import { fitTiming, shiftFor, type Fit, type TimingModel } from "./model";

/**
 * Subtitle-to-subtitle sync: correcting the timing of the subtitle a viewer
 * chose, using another subtitle of the same title as the clock.
 *
 * Nothing here knows what language anything is in. A reference is any other
 * track whose events look like a transcript of the same conversation, and the
 * engine decides which one that is by measuring, not by preferring English.
 */

export type SyncCandidate = {
  id: string;
  /** Language tag if the source declared one; only ever used for reporting. */
  lang?: string;
  label?: string;
  cues: SubCue[];
};

export type SyncReport = {
  applied: boolean;
  /** Seconds to add to a time in the selected subtitle. */
  shift: (t: number) => number;
  model: TimingModel;
  confidence: number;
  referenceId: string | null;
  referenceLabel: string | null;
  anchors: number;
  residualSec: number;
  driftCorrected: boolean;
  /** How many references agreed, when more than one was usable. */
  agreeingReferences: number;
  reason?: string;
};

export type SyncOptions = {
  durationSec: number;
  /** Below this, the result is reported but not applied. */
  minConfidence?: number;
  /** How many references to actually align against. */
  maxReferences?: number;
};

/**
 * Where "believe it" starts.
 *
 * Calibrated against the cases either side of it rather than picked: a subtitle
 * missing half its lines, correctly aligned to the frame, scores 0.59; two
 * different films score 0.40. The line goes in the gap, nearer the wrong answer
 * than the right one, because applying a bad correction is worse than leaving a
 * viewer to nudge the delay themselves.
 */
const DEFAULT_MIN_CONFIDENCE = 0.55;

/**
 * How usable a track is as a clock.
 *
 * A reference is good when it has many dialogue events, spread over the whole
 * runtime, at a believable density — that is what gives the aligner something to
 * hold on to at every point in the film. Language is not part of the score, and
 * neither is whether it happens to be English.
 */
export function scoreReference(events: ClassifiedCue[], durationSec: number): number {
  const dialogue = dialogueOnly(events);
  if (dialogue.length < 20 || durationSec <= 0) return 0;

  const count = Math.min(1, dialogue.length / 600);

  const first = dialogue[0].cue.start;
  const last = dialogue[dialogue.length - 1].cue.end;
  const span = Math.min(1, (last - first) / (durationSec * 0.8));

  const buckets = new Set(dialogue.map((d) => Math.floor((d.cue.start / durationSec) * 20)));
  const spread = Math.min(1, buckets.size / 18);

  const perMinute = dialogue.length / Math.max(1, durationSec / 60);
  // Six to twenty lines a minute is ordinary speech; far outside that is a
  // karaoke track, a forced-subtitle file, or something broken.
  const density = perMinute < 2 || perMinute > 45 ? 0.2 : 1;

  const withText = dialogue.filter((d) => d.dialogueText.length >= 4).length / dialogue.length;

  return 0.3 * count + 0.2 * span + 0.25 * spread + 0.15 * density + 0.1 * withText;
}

type PreparedTrack = {
  candidate: SyncCandidate;
  events: ClassifiedCue[];
  dialogue: ClassifiedCue[];
  score: number;
};

function prepareTrack(candidate: SyncCandidate, durationSec: number): PreparedTrack {
  const events = classifyCues(candidate.cues, durationSec);
  return {
    candidate,
    events,
    dialogue: dialogueOnly(events),
    score: scoreReference(events, durationSec),
  };
}

/**
 * Aligns the selected subtitle against the best references available and
 * reports a correction, or declines.
 *
 * More than one reference is used when more than one is good: two independent
 * tracks landing on the same offset is far stronger evidence than one track
 * landing on it alone, and two tracks disagreeing is a reason to distrust both.
 */
export function syncSubtitles(
  selected: SyncCandidate,
  references: SyncCandidate[],
  opts: SyncOptions,
): SyncReport {
  const { durationSec } = opts;
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxReferences = opts.maxReferences ?? 3;

  const decline = (reason: string): SyncReport => ({
    applied: false,
    shift: () => 0,
    model: { kind: "constant", offsetSec: 0 },
    confidence: 0,
    referenceId: null,
    referenceLabel: null,
    anchors: 0,
    residualSec: 0,
    driftCorrected: false,
    agreeingReferences: 0,
    reason,
  });

  const target = prepareTrack(selected, durationSec);
  if (target.dialogue.length < 20) return decline("the chosen subtitle has too little dialogue");

  // The opening credits are not the start of the conversation.
  const startIndex = firstDialogueIndex(target.events);
  const targetDialogue = target.dialogue.filter((d) => d.index >= startIndex);

  const ranked = references
    .filter((r) => r.id !== selected.id && r.cues.length > 0)
    .map((r) => prepareTrack(r, durationSec))
    .filter((r) => r.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxReferences);

  if (ranked.length === 0) return decline("no other subtitle here is usable as a reference");

  const fits: Array<{ track: PreparedTrack; fit: Fit; anchors: Anchor[] }> = [];
  for (const ref of ranked) {
    const refStart = firstDialogueIndex(ref.events);
    const refDialogue = ref.dialogue.filter((d) => d.index >= refStart);
    const anchors = alignEvents(targetDialogue, refDialogue);
    const fit = fitTiming(anchors, durationSec);
    if (fit) fits.push({ track: ref, fit, anchors });
  }
  if (fits.length === 0) return decline("could not match the two subtitles");

  fits.sort((a, b) => b.fit.confidence - a.fit.confidence);
  const best = fits[0];
  const bestShift = shiftFor(best.fit.model);

  // Agreement between independent references, measured where it matters: at the
  // middle of the film, where a drift disagreement has grown large enough to see.
  const probe = durationSec / 2;
  const agreeing = fits.filter(
    (f) => Math.abs(shiftFor(f.fit.model)(probe) - bestShift(probe)) <= 0.5,
  ).length;

  let confidence = best.fit.confidence;
  if (fits.length > 1) {
    // Two references that agree raise the answer above what either could carry
    // alone; two that disagree mean one of them is aligned to the wrong film.
    confidence = agreeing > 1 ? Math.min(1, confidence + 0.12) : confidence * 0.7;
  }

  const applied = confidence >= minConfidence;
  return {
    applied,
    shift: bestShift,
    model: best.fit.model,
    confidence,
    referenceId: best.track.candidate.id,
    referenceLabel: best.track.candidate.label ?? best.track.candidate.lang ?? null,
    anchors: best.fit.anchors,
    residualSec: best.fit.residualSec,
    driftCorrected: best.fit.driftCorrected,
    agreeingReferences: agreeing,
    reason: applied ? undefined : "not confident enough to change the timing",
  };
}
