import { normalizeArabic } from "@/lib/iptv/rtl";
import type { Meta } from "@/lib/cinemeta";

/**
 * Ordering results by how well they answer what was actually typed.
 *
 * None of the sources this app searches returns relevance. TMDB's multi search
 * is ordered by popularity, Cinemeta by its own catalogue rank, and an add-on by
 * whatever its author chose — so three letters bring back whatever is *famous*
 * enough to have matched something. `spi` answered with Hobbs & Shaw above
 * Spider-Man, and the merge step made it worse by simply appending one source
 * after another.
 *
 * The sources cannot be asked to agree, so the ordering is imposed here, over
 * the merged list, at the one point where every candidate is finally comparable.
 *
 * Four tiers, coarse on purpose. A blended score is impossible to argue with
 * when it puts the wrong thing first; a tier is a promise the viewer can check
 * from the sofa — a title that *begins* with what they typed always comes before
 * one that merely contains it.
 */

const EXACT = 0;
const PREFIX = 1;
const WORD_START = 2;
const CONTAINS = 3;
const NO_MATCH = 4;

/**
 * Reduces a title to the words in it.
 *
 * Punctuation is where a literal comparison fails: `Spider-Man` does not begin
 * with `spider man`, and `WALL·E` matches nothing anyone can type on the
 * on-screen keyboard. Folding both sides to letters, digits and single spaces
 * makes the tiers depend on the words rather than on the typography.
 *
 * Arabic goes through the app's own normaliser first, so a title stored with
 * hamza, ta marbuta or harakat is still found by a viewer typing the plain
 * forms — which are the ones the TV keyboard offers.
 */
function fold(s: string): string {
  return normalizeArabic(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Which tier a title falls into for this query. Lower is better. */
export function titleRank(name: string, query: string): number {
  const title = fold(name);
  const q = fold(query);
  if (!title || !q) return NO_MATCH;
  if (title === q) return EXACT;
  if (title.startsWith(q)) return PREFIX;
  // Folding leaves exactly one space between words, so a leading space is a word
  // boundary and nothing else.
  if (title.includes(` ${q}`)) return WORD_START;
  if (title.includes(q)) return CONTAINS;
  return NO_MATCH;
}

/**
 * The same list, most relevant first.
 *
 * Titles that match nothing are kept, at the end. A source returned them for a
 * reason the query does not show — an alternative title, a cast member, a
 * translation — and dropping them would turn a bad ordering into a missing
 * result, which is the worse failure.
 */
/**
 * Collapses one title that arrived from two sources.
 *
 * Ids are not comparable across sources: an add-on catalogue answers with its
 * own identifiers and Cinemeta with IMDb ones, so `mergeMetas` — which can only
 * dedupe by id — lets the same film through twice. Measured on the emulator:
 * "spi" returned Spider-Man: Far from Home from an installed add-on and again
 * from Cinemeta, under different ids.
 *
 * It was survivable while results were two lists with headings and is not in a
 * grid, where it is simply the same poster twice.
 *
 * A year is the only thing that can prove two identical titles are different
 * films, so it is the only thing that keeps both. When either side does not
 * state one there is no such proof, and inside a single set of results for a
 * single query the honest reading is that it is the same title.
 */
export function dedupeByTitle(items: Meta[]): Meta[] {
  const kept = new Map<string, string>();
  const out: Meta[] = [];
  for (const item of items) {
    const name = fold(item.name ?? "");
    if (!name) {
      out.push(item);
      continue;
    }
    const year = (item.releaseInfo ?? "").match(/\d{4}/)?.[0] ?? "";
    const first = kept.get(name);
    if (first === undefined) {
      kept.set(name, year);
      out.push(item);
    } else if (first && year && first !== year) {
      out.push(item);
    }
  }
  return out;
}

export function rankMetas(items: Meta[], query: string): Meta[] {
  if (!query.trim() || items.length < 2) return items;
  // Ranked once per item rather than once per comparison: `sort` calls the
  // comparator O(n log n) times and folding a title is the expensive half.
  const rank = new Map<Meta, number>();
  for (const item of items) rank.set(item, titleRank(item.name ?? "", query));
  // The sort is stable, which is what preserves each source's own ordering
  // inside a tier — popularity still decides between two titles that both begin
  // with the query.
  return [...items].sort((a, b) => (rank.get(a) ?? NO_MATCH) - (rank.get(b) ?? NO_MATCH));
}
