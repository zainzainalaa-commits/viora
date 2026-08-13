import type { Anchor } from "./align";

/**
 * Turning matched pairs into a correction, and deciding how much to believe it.
 *
 * The order here is the whole discipline: start with the simplest thing that
 * could explain the anchors, and only reach for a more elaborate model when the
 * data insists. A piecewise map fitted to noise will follow the noise
 * beautifully and be wrong everywhere between the points.
 */

export type TimingModel =
  | { kind: "constant"; offsetSec: number }
  | { kind: "linear"; slope: number; interceptSec: number }
  | { kind: "piecewise"; points: Array<{ at: number; deltaSec: number }> };

export type Fit = {
  model: TimingModel;
  /** 0..1. Below the caller's threshold, nothing is applied. */
  confidence: number;
  anchors: number;
  /** Typical error left over, in seconds — what the viewer would still see. */
  residualSec: number;
  /** True when the drift term is doing real work. */
  driftCorrected: boolean;
};

/** delta = reference - selected: what has to be added to the selected time. */
function deltas(anchors: Anchor[]): Array<{ t: number; d: number; w: number }> {
  return anchors.map((a) => ({ t: a.selected, d: a.reference - a.selected, w: a.weight }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Anchors that disagree with the crowd are thrown out before anything is fitted.
 *
 * A handful of confident mismatches is normal — two different lines that happen
 * to be the same length in a quiet stretch — and a least-squares fit will chase
 * them. The median absolute deviation is the robust way to spot them, and costs
 * one sort.
 */
function rejectOutliers(points: Array<{ t: number; d: number; w: number }>) {
  if (points.length < 12) return points;

  // Judged against the neighbourhood, not against the film.
  //
  // A single median assumes the offset is one number — which is the very thing
  // being measured. On a subtitle whose second reel starts five seconds late,
  // every anchor after the join sits far from the global median and was thrown
  // out as noise: measured, 672 anchors became 356, the step disappeared with
  // them, and the model settled on the first reel's offset for the whole film.
  //
  // A rolling median tracks whatever shape the deltas really have, so an anchor
  // is only suspect when it disagrees with the anchors around it.
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const half = 10;
  const kept: typeof sorted = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const from = Math.max(0, i - half);
    const to = Math.min(sorted.length, i + half + 1);
    const window = sorted.slice(from, to).map((p) => p.d);
    const med = median(window);
    const mad = median(window.map((d) => Math.abs(d - med))) || 0.2;
    if (Math.abs(sorted[i].d - med) <= Math.max(1.0, 4 * mad)) kept.push(sorted[i]);
  }
  return kept.length >= 4 ? kept : points;
}

function weightedLine(points: Array<{ t: number; d: number; w: number }>) {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sw += p.w;
    sx += p.w * p.t;
    sy += p.w * p.d;
    sxx += p.w * p.t * p.t;
    sxy += p.w * p.t * p.d;
  }
  const denom = sw * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return { slope: 0, intercept: sy / (sw || 1) };
  return {
    slope: (sw * sxy - sx * sy) / denom,
    intercept: (sy * sxx - sx * sxy) / denom,
  };
}

function residual(points: Array<{ t: number; d: number }>, f: (t: number) => number): number {
  if (points.length === 0) return 0;
  const errs = points.map((p) => Math.abs(p.d - f(p.t))).sort((a, b) => a - b);
  // The 80th percentile rather than the mean: one bad anchor should not decide
  // whether a good fit is called good.
  return errs[Math.min(errs.length - 1, Math.floor(errs.length * 0.8))];
}

/** Anchors spread across the runtime are worth more than anchors in one scene. */
function coverage(points: Array<{ t: number }>, durationSec: number): number {
  if (points.length < 2 || durationSec <= 0) return 0;
  const buckets = new Set(points.map((p) => Math.floor((p.t / durationSec) * 10)));
  return Math.min(1, buckets.size / 8);
}

const MAX_SANE_SLOPE = 0.02; // 20ms per second is already a broken file.

export function fitTiming(anchors: Anchor[], durationSec: number): Fit | null {
  const all = deltas(anchors);
  const points = rejectOutliers(all);
  if (points.length < 4) return null;

  const cover = coverage(points, durationSec);
  const meanWeight = points.reduce((a, p) => a + p.w, 0) / points.length;

  // Model 1: one number for the whole film.
  const constant = median(points.map((p) => p.d));
  const constantResidual = residual(points, () => constant);

  // Model 2: a slope, but only if it explains something the constant does not.
  const line = weightedLine(points);
  const linearResidual = residual(points, (t) => line.slope * t + line.intercept);
  const slopeSane = Math.abs(line.slope) <= MAX_SANE_SLOPE;
  const linearHelps = slopeSane && linearResidual < constantResidual * 0.7 && points.length >= 8;

  // Model 3: a map between anchor points, for a file that was cut and rejoined.
  // It is only reached when a straight line genuinely fails, because between two
  // anchors it can only interpolate — and interpolating noise is worse than
  // ignoring it.
  let model: TimingModel;
  let chosenResidual: number;
  let drift = false;

  // A reel joined a few seconds late is a step, not a slope: a straight line
  // fits it no better than a single number does, and both leave seconds of
  // error. So the map is considered whenever one number is visibly failing —
  // not only when a slope happened to help first.
  const simplestResidual = linearHelps ? linearResidual : constantResidual;
  const worthMapping = simplestResidual > 0.6 && points.length >= 14 && cover > 0.5;

  if (worthMapping) {
    const piecewise = buildPiecewise(points);
    const piecewiseResidual = residual(points, mapOf(piecewise));
    if (piecewiseResidual < simplestResidual * 0.6) {
      model = { kind: "piecewise", points: piecewise };
      chosenResidual = piecewiseResidual;
      drift = true;
    } else if (linearHelps) {
      model = { kind: "linear", slope: line.slope, interceptSec: line.intercept };
      chosenResidual = linearResidual;
      drift = true;
    } else {
      model = { kind: "constant", offsetSec: constant };
      chosenResidual = constantResidual;
    }
  } else if (linearHelps) {
    model = { kind: "linear", slope: line.slope, interceptSec: line.intercept };
    chosenResidual = linearResidual;
    drift = true;
  } else {
    model = { kind: "constant", offsetSec: constant };
    chosenResidual = constantResidual;
  }

  const modelAt = shiftFor(model);

  // Confidence is about the evidence, not about the size of the correction: how
  // many anchors agreed, how well they are spread, how strongly they matched,
  // and how much error the model still leaves.
  const countScore = Math.min(1, points.length / 40);
  const fitScore = 1 - Math.min(1, chosenResidual / 1.2);
  const agreement = points.length / Math.max(1, all.length);

  // How well the matches themselves scored, sharpened.
  //
  // Two subtitles of different films still produce a full set of pairs — the
  // aligner will always find *a* path — and they are all mediocre. Averaged
  // weight around 0.6 against around 0.8 is the difference between "these lines
  // are the same line" and "these lines are both about four seconds long", so it
  // is stretched rather than added: below 0.7 it pulls the whole score down.
  const quality = Math.max(0, Math.min(1, (meanWeight - 0.55) / 0.25));

  // How many anchors the model actually explains.
  //
  // This is the strongest signal there is, and it is the one that separates the
  // two hard cases from each other. A subtitle missing half its lines still
  // produces hundreds of anchors that land on the model to within a frame — that
  // cannot happen by accident. Two different films produce just as many pairs and
  // they scatter. Individual match scores cannot tell those apart; agreement with
  // a single simple model can.
  const explained =
    points.filter((p) => Math.abs(p.d - modelAt(p.t)) <= 0.25).length / points.length;

  const raw =
    0.2 * countScore + 0.16 * cover + 0.16 * fitScore + 0.12 * quality + 0.06 * agreement + 0.3 * explained;
  const confidence = Math.max(0, Math.min(1, raw * (0.75 + 0.25 * quality)));

  return { model, confidence, anchors: points.length, residualSec: chosenResidual, driftCorrected: drift };
}

/** Anchor points thinned to one per stretch, so the map is a spine not a rope. */
function buildPiecewise(points: Array<{ t: number; d: number; w: number }>) {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: Array<{ at: number; deltaSec: number }> = [];
  const step = Math.max(60, (sorted[sorted.length - 1].t - sorted[0].t) / 12);
  let bucketStart = sorted[0].t;
  let bucket: typeof sorted = [];
  for (const p of sorted) {
    if (p.t - bucketStart > step && bucket.length) {
      out.push({ at: median(bucket.map((b) => b.t)), deltaSec: median(bucket.map((b) => b.d)) });
      bucket = [];
      bucketStart = p.t;
    }
    bucket.push(p);
  }
  if (bucket.length) {
    out.push({ at: median(bucket.map((b) => b.t)), deltaSec: median(bucket.map((b) => b.d)) });
  }
  return out;
}

function mapOf(points: Array<{ at: number; deltaSec: number }>) {
  return (t: number) => interpolate(points, t);
}

function interpolate(points: Array<{ at: number; deltaSec: number }>, t: number): number {
  if (points.length === 0) return 0;
  if (t <= points[0].at) return points[0].deltaSec;
  const last = points[points.length - 1];
  if (t >= last.at) return last.deltaSec;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (t <= b.at) {
      const span = b.at - a.at;
      if (span <= 1e-6) return b.deltaSec;
      const k = (t - a.at) / span;
      return a.deltaSec + k * (b.deltaSec - a.deltaSec);
    }
  }
  return last.deltaSec;
}

/** The correction itself: seconds to add to a time in the selected subtitle. */
export function shiftFor(model: TimingModel): (t: number) => number {
  if (model.kind === "constant") return () => model.offsetSec;
  if (model.kind === "linear") return (t) => model.slope * t + model.interceptSec;
  return (t) => interpolate(model.points, t);
}
