/**
 * Turning a line of dialogue into something two languages can be compared on.
 *
 * None of this touches what the viewer reads. It exists so that "I'm going
 * home." and "أنا ذاهب إلى المنزل." can be measured against each other, which
 * means throwing away everything that is about the language and keeping
 * everything that is about the line: how long it is, what numbers are in it,
 * which names it mentions, whether it is a question.
 */

const RTL_MARKS = /[‎‏‪-‮⁦-⁩]/g;
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Arabic-Indic digits are the same numbers, written differently. */
function latinDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function stripMarkup(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, "") // ASS override blocks
    .replace(/<[^>]+>/g, "") // HTML
    .replace(/\\[Nnh]/g, " ") // ASS line breaks
    .replace(RTL_MARKS, "");
}

/**
 * The comparable form of a line.
 *
 * Speaker labels, hearing-impaired brackets and stage directions are removed
 * because one file's convention is not another's; case and punctuation go for
 * the same reason. What is left is words and numbers.
 */
export function normalizeForCompare(text: string): string {
  return latinDigits(stripMarkup(text))
    .replace(/^\s*[-–—]\s*/gm, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/^[^:：\n]{1,24}[:：]\s*/gm, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The parts of a line that survive translation.
 *
 * Numbers stay numbers, and names written in Latin script usually stay
 * themselves even in a subtitle that is otherwise Arabic or Persian — so a line
 * containing "Silo 47" is recognisable across files without knowing a word of
 * either language. This is what makes the cheap matching stage work across
 * scripts, and it costs nothing to compute.
 */
export type LineSignature = {
  /** Words, after normalising. */
  words: string[];
  /** Numbers as written, which cross languages unchanged. */
  numbers: string[];
  /** Latin-script tokens of three or more characters: names, places, brands. */
  latinTokens: string[];
  /** Whether the line ends as a question, in either script. */
  question: boolean;
  /** Length in characters after normalising, which tracks with speech length. */
  length: number;
};

export function signatureOf(text: string): LineSignature {
  const clean = normalizeForCompare(text);
  const words = clean ? clean.split(" ").filter(Boolean) : [];
  const numbers = (latinDigits(stripMarkup(text)).match(/\d+/g) ?? []).filter((n) => n.length <= 6);
  const latinTokens = words.filter((w) => w.length >= 3 && /^[a-z][a-z'-]*$/.test(w));
  const bare = stripMarkup(text).trim();
  return {
    words,
    numbers,
    latinTokens,
    question: /[?؟]\s*$/.test(bare),
    length: clean.length,
  };
}

/** Jaccard overlap of two token lists, 0 when either is empty. */
export function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let shared = 0;
  const seen = new Set<string>();
  for (const t of b) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (setA.has(t)) shared += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}
