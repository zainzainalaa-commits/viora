import type { ClassifiedCue } from "./classify";
import { overlap, signatureOf, type LineSignature } from "./normalize";

/**
 * Matching two subtitle files that may share no alphabet.
 *
 * The naive approach — compare timestamps — assumes the answer. The approach
 * that works assumes only that both files describe the same conversation: the
 * same lines, in the same order, of roughly the same lengths, with the same
 * pauses between them. That shape is language-independent, and it is what this
 * aligner reads.
 *
 * Three things are compared, in increasing cost:
 *
 *  1. Structure — how long the line is, how long the gap before it was, whether
 *     it is a question. Free, and enough to rule out most pairings.
 *  2. Content that survives translation — numbers, and names in Latin script.
 *     "Silo 47" is "Silo 47" in an Arabic subtitle too.
 *  3. Shared words, which only helps between related languages but is free when
 *     it does.
 *
 * A learned multilingual embedder would be a fourth stage and a better one; it
 * is deliberately not shipped here, because a model per playback on a television
 * box is a cost the feature cannot carry. `scorePair` is where it would go.
 */

export type Anchor = {
  /** Time in the subtitle being corrected. */
  selected: number;
  /** Time in the reference. */
  reference: number;
  /** How strongly the two events matched, 0..1. */
  weight: number;
};

type Prepared = {
  cue: ClassifiedCue;
  sig: LineSignature;
  /** Seconds of silence before this event, capped — pauses are structure. */
  gapBefore: number;
  duration: number;
};

function prepare(events: ClassifiedCue[]): Prepared[] {
  return events.map((c, i) => ({
    cue: c,
    sig: signatureOf(c.dialogueText),
    gapBefore: i === 0 ? 0 : Math.min(12, Math.max(0, c.cue.start - events[i - 1].cue.end)),
    duration: Math.max(0.2, c.cue.end - c.cue.start),
  }));
}

/**
 * How alike two events are, ignoring when they happen.
 *
 * Timing is deliberately absent: it is the unknown being solved for, and letting
 * it into the similarity score is what makes an aligner agree with whatever
 * offset it started from.
 */
function scorePair(a: Prepared, b: Prepared): number {
  // Length ratio: a line takes about as long to say in any language.
  const lenRatio =
    Math.min(a.sig.length, b.sig.length) / Math.max(1, Math.max(a.sig.length, b.sig.length));
  const durRatio = Math.min(a.duration, b.duration) / Math.max(a.duration, b.duration);
  const gapDelta = Math.abs(a.gapBefore - b.gapBefore);
  const gapScore = 1 - Math.min(1, gapDelta / 6);

  let score = 0.34 * lenRatio + 0.26 * durRatio + 0.2 * gapScore;
  if (a.sig.question === b.sig.question) score += 0.06;

  // Content that crosses languages, weighted heavily when present because it is
  // nearly conclusive: two lines sharing "1987" and "Bernard" are the same line.
  const numbers = overlap(a.sig.numbers, b.sig.numbers);
  const latin = overlap(a.sig.latinTokens, b.sig.latinTokens);
  const words = overlap(a.sig.words, b.sig.words);
  score += 0.24 * Math.max(numbers, latin);
  score += 0.08 * words;

  return Math.min(1, score);
}

/**
 * How far apart two events may be and still be considered the same line.
 *
 * This is the whole search window, and it is what lets the aligner find an
 * offset without being told roughly where it is. A coarse cross-correlation used
 * to seed it; on evenly-paced dialogue that estimate was noise — it answered 84
 * seconds for a subtitle three seconds out — and the band found the truth anyway.
 * One honest mechanism beats two, one of which lies.
 */
const BAND_SEC = 300;
const WIDE_BAND_SEC = 900;

/**
 * Walks the two files together and pairs their events.
 *
 * This is a dynamic-time-warp over the dialogue lists: it may pair one event
 * with one, skip an event on either side (a line the other file does not carry),
 * or pair one against two consecutively (a sentence split differently). Those
 * are exactly the shapes subtitle files differ in.
 *
 * The search is banded — a pairing is only considered when the two events are
 * already within a few minutes of each other — which keeps a two-hour film to a
 * few million cheap comparisons instead of a few hundred million, and stops the
 * aligner from proposing that the opening line matches the closing one.
 */
export function alignEvents(
  selected: ClassifiedCue[],
  reference: ClassifiedCue[],
  opts: { bandSec?: number } = {},
): Anchor[] {
  const S = prepare(selected);
  const R = prepare(reference);
  if (S.length < 4 || R.length < 4) return [];

  const band = opts.bandSec ?? BAND_SEC;
  const n = S.length;
  const m = R.length;

  // Cost matrix rows are kept one at a time; the path is recovered from a
  // compact move table, which is what keeps memory flat on a long film.
  const NEG = -1e9;
  const width = m + 1;
  // Three rows are kept because a move may consume two selected events at once,
  // which is how a sentence split across two lines is matched to the single line
  // that carries it in the other file.
  let prev2 = new Float32Array(width).fill(0);
  let prev1 = new Float32Array(width).fill(0);
  let curr = new Float32Array(width).fill(0);
  const moves = new Uint8Array((n + 1) * width);

  const inBand = (si: number, rj: number) =>
    Math.abs(S[si].cue.cue.start - R[rj].cue.cue.start) <= band;

  for (let i = 1; i <= n; i += 1) {
    curr[0] = 0;
    for (let j = 1; j <= m; j += 1) {
      const skipS = prev1[j];
      const skipR = curr[j - 1];
      let best = skipS >= skipR ? skipS : skipR;
      let move = skipS >= skipR ? 1 : 2;

      if (inBand(i - 1, j - 1)) {
        const pair = prev1[j - 1] + scorePair(S[i - 1], R[j - 1]);
        if (pair > best) {
          best = pair;
          move = 3;
        }
        if (i >= 2) {
          // Slightly discounted: a two-to-one match is real, but preferring it
          // whenever it scores a hair higher would shred the pairing.
          const merged = scorePair(mergePair(S[i - 2], S[i - 1]), R[j - 1]) * 0.95;
          const twoToOne = prev2[j - 1] + merged;
          if (twoToOne > best) {
            best = twoToOne;
            move = 4;
          }
        }
      }
      curr[j] = best === NEG ? 0 : best;
      moves[i * width + j] = move;
    }
    const spare = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = spare;
    curr.fill(0);
  }

  // Walk the moves back to the pairs that were taken.
  const anchors: Anchor[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const move = moves[i * width + j];
    if (move === 3) {
      const s = S[i - 1];
      const r = R[j - 1];
      const w = scorePair(s, r);
      if (w >= 0.55) {
        anchors.push({ selected: s.cue.cue.start, reference: r.cue.cue.start, weight: w });
      }
      i -= 1;
      j -= 1;
    } else if (move === 4) {
      const s = S[i - 2];
      const r = R[j - 1];
      const w = scorePair(mergePair(S[i - 2], S[i - 1]), r);
      if (w >= 0.6) {
        // The pair starts where the first of the two lines starts.
        anchors.push({ selected: s.cue.cue.start, reference: r.cue.cue.start, weight: w * 0.9 });
      }
      i -= 2;
      j -= 1;
    } else if (move === 1) {
      i -= 1;
    } else if (move === 2) {
      j -= 1;
    } else break;
  }
  anchors.reverse();

  // A subtitle that is minutes out — a different cut, a wrong episode file —
  // falls outside the ordinary window. One wider pass is cheap and rescues it;
  // beyond that the two files are not the same conversation.
  if (anchors.length < 8 && band < WIDE_BAND_SEC) {
    return alignEvents(selected, reference, { bandSec: WIDE_BAND_SEC });
  }
  return anchors;
}

/** Two consecutive lines read as one, for the split-sentence case. */
function mergePair(a: Prepared, b: Prepared): Prepared {
  return {
    cue: a.cue,
    sig: signatureOf(`${a.cue.dialogueText} ${b.cue.dialogueText}`),
    gapBefore: a.gapBefore,
    duration: Math.max(0.2, b.cue.cue.end - a.cue.cue.start),
  };
}
