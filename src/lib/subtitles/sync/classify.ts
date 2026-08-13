import type { SubCue } from "../parser";

/**
 * What a subtitle event actually is.
 *
 * Alignment compares two subtitle files against each other, and the thing that
 * ruins it is everything in them that is not dialogue. A fansub signature sits
 * at 00:00:00 in one file and nowhere in the other; a watermark repeats every
 * ten minutes on one side only; a song is subtitled in one language and left
 * alone in the next. Matching those against dialogue produces anchors that are
 * confidently wrong, which is worse than having fewer of them.
 *
 * So every event is classified first, and only dialogue is aligned. Nothing is
 * removed from the subtitle the viewer sees — this is a reading of the file, not
 * an edit to it.
 */
export type EventKind =
  | "dialogue"
  | "song"
  | "sign"
  | "speaker"
  | "credit"
  | "url"
  | "watermark"
  | "advert"
  | "metadata";

export type ClassifiedCue = {
  cue: SubCue;
  index: number;
  kind: EventKind;
  /** The dialogue left after a credit line was lifted off the same event. */
  dialogueText: string;
};

const URL_RE = /(https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|\.tv\b|t\.me\/|@[a-z0-9_]{3,})/i;

/**
 * Credit wording, in the languages this app actually ships subtitles for.
 *
 * Written as fragments rather than whole lines because a signature is a line the
 * translator composed freely — "ترجمة وتعديل: فلان", "Sub by XYZ team",
 * "Перевод: ...". What stays constant is the verb and the colon.
 */
const CREDIT_RE =
  /(^|\s)(ترجم[ةه]?|ترجمه|تعديل|توقيت|سحب|رفع|تدقيق|إعداد|اعداد|مدونة|قناة)\s*([:：]|و?\s*(فريق|إعداد|اعداد|تعديل|توقيت))|(^|\s)فريق\s+\S+|(^|\s)(translat(ed|ion)|subtitle[sd]?|sync(ed|hronized)?|corrected|encoded|ripped|resync|subs?)\s+(by|:)|(^|\s)(sub(title)?s?\s*[:：])|©|\(c\)\s*\d{4}|fansub|subscene|opensubtitles|addic7ed|podnapisi/i;

const ADVERT_RE =
  /(اشترك|تابعنا|زوروا|للإعلان|دعمنا|تبرع)|\b(subscribe|follow us|donate|support us|visit|join our|discord\.gg|patreon)\b/i;

/** A speaker label: "JOHN:", "- MARY:", "[MAN]", "(narrator)". */
const SPEAKER_RE = /^\s*[-–—]?\s*(\[[^\]]{1,24}\]|\([^)]{1,24}\)|[A-Z][A-Z .'-]{1,22})\s*[:：]/;

/** Songs are marked with a note in almost every convention there is. */
const SONG_RE = /^[\s\-–—]*[♪♫#]|[♪♫]\s*$/;

/**
 * Signs and forced narration: shouted capitals, no sentence punctuation.
 *
 * The test has to be script-aware. "Text with no lowercase letters" describes a
 * sign in English and describes *all Arabic, Persian, Hebrew, Chinese and
 * Japanese dialogue*, which have no letter case at all — an earlier version of
 * this rule classified every Arabic line in the file as a sign and left the
 * aligner with nothing to work with.
 */
const LATIN_RE = /[a-z]/i;
function looksLikeSign(text: string): boolean {
  if (!LATIN_RE.test(text)) return false;
  return !/[a-z]/.test(text);
}

const RTL_MARKS = /[‎‏‪-‮⁦-⁩]/g;

function stripTags(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(RTL_MARKS, "");
}

/**
 * Splits a credit off an event that carries both.
 *
 * "ترجمة فريق XYZ\nWhere are you going?" is a real line of dialogue with a
 * signature stapled to it, and throwing the whole event away loses an anchor
 * that the other file certainly has. Each line is judged on its own; what
 * survives is the dialogue.
 */
function splitCredit(text: string): { dialogue: string; hadCredit: boolean } {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let hadCredit = false;
  for (const line of lines) {
    const bare = stripTags(line).trim();
    if (!bare) continue;
    if (CREDIT_RE.test(bare) || URL_RE.test(bare) || ADVERT_RE.test(bare)) {
      hadCredit = true;
      continue;
    }
    kept.push(bare);
  }
  return { dialogue: kept.join(" ").trim(), hadCredit };
}

function classifyOne(cue: SubCue, index: number, total: number, durationSec: number): ClassifiedCue {
  const raw = stripTags(cue.text).trim();
  const { dialogue, hadCredit } = splitCredit(cue.text);

  // Order matters: a credit that also contains a URL is still a credit, and a
  // song lyric in capitals is a song rather than a sign.
  let kind: EventKind = "dialogue";
  if (!raw) kind = "metadata";
  else if (SONG_RE.test(raw)) kind = "song";
  else if (CREDIT_RE.test(raw) && !dialogue) kind = "credit";
  else if (ADVERT_RE.test(raw) && !dialogue) kind = "advert";
  else if (URL_RE.test(raw) && !dialogue) kind = "url";
  else if (!dialogue && hadCredit) kind = "credit";
  else if (SPEAKER_RE.test(raw) && raw.replace(SPEAKER_RE, "").trim().length === 0) kind = "speaker";
  else if (raw.length > 3 && looksLikeSign(raw) && !/[.?!،؟]/.test(raw)) kind = "sign";

  // A signature that repeats on a timer is a watermark, not a one-off credit.
  // Position alone cannot tell them apart, so the caller marks repeats below.
  void total;
  void durationSec;

  return { cue, index, kind, dialogueText: dialogue || raw };
}

/**
 * Reads a subtitle file as a list of what its events are.
 *
 * Repeats are resolved after the first pass: identical text appearing three or
 * more times spread across the runtime is a watermark however it is worded, and
 * that is a judgement only the whole file can make.
 */
export function classifyCues(cues: SubCue[], durationSec: number): ClassifiedCue[] {
  const out = cues.map((c, i) => classifyOne(c, i, cues.length, durationSec));

  const seen = new Map<string, number[]>();
  for (const c of out) {
    const key = c.dialogueText.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (key.length < 6) continue;
    const at = seen.get(key);
    if (at) at.push(c.index);
    else seen.set(key, [c.index]);
  }
  for (const [, indices] of seen) {
    if (indices.length < 4) continue;
    const times = indices.map((i) => cues[i].start);
    if (times[times.length - 1] - times[0] < 300) continue;

    // Repetition alone is not a watermark. "I don't know." comes back a dozen
    // times in any film, spread from beginning to end — an earlier version of
    // this rule struck out every such line, and on a transcript with ordinary
    // repeated dialogue it removed the entire file from consideration.
    //
    // What distinguishes a watermark is that it is *on a timer*: the gaps
    // between its appearances are all the same. Dialogue does not do that. A
    // signature that also reads as a credit needs no such proof.
    const text = out[indices[0]].dialogueText;
    const looksLikeCredit = CREDIT_RE.test(text) || URL_RE.test(text) || ADVERT_RE.test(text);
    let regular = false;
    if (times.length >= 4) {
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
      regular = mean > 60 && spread / mean < 0.25;
    }
    if (!looksLikeCredit && !regular) continue;
    for (const i of indices) out[i].kind = "watermark";
  }
  return out;
}

/** The events worth aligning: dialogue with enough text to be recognisable. */
export function dialogueOnly(classified: ClassifiedCue[]): ClassifiedCue[] {
  return classified.filter((c) => c.kind === "dialogue" && c.dialogueText.length >= 2);
}

/**
 * Where the real dialogue starts.
 *
 * The first event in a file is very often a signature, and treating it as the
 * start of the conversation drags the first anchor — and with it the whole
 * offset — several seconds off. The opening is the first run of dialogue events
 * close enough together to be a scene rather than a stray line.
 */
export function firstDialogueIndex(classified: ClassifiedCue[]): number {
  const dialogue = dialogueOnly(classified);
  for (let i = 0; i + 2 < dialogue.length; i += 1) {
    const a = dialogue[i];
    const b = dialogue[i + 2];
    if (b.cue.start - a.cue.start <= 90) return a.index;
  }
  return dialogue[0]?.index ?? 0;
}
