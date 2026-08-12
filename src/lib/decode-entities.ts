/**
 * Turns the handful of HTML entities that arrive inside metadata back into the
 * characters they stand for.
 *
 * React renders text, not markup, which is the right default and the reason a
 * name arriving as "Emma D&apos;Arcy" is shown with the entity spelled out on
 * screen. Cinemeta escapes its strings this way, and Cinemeta is what serves
 * this app whenever there is no TMDB key — so on a fresh install every name with
 * an apostrophe in it reads as broken.
 *
 * Deliberately a small fixed table rather than a parser: the input is a name or
 * a character, not a document, and letting arbitrary markup through a decoder on
 * its way to the screen is how text turns into something else.
 */
const ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&#34;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&amp;": "&",
};

export function decodeEntities(input: string | null | undefined): string {
  if (!input) return "";
  if (!input.includes("&")) return input;
  // `&amp;` last, so "&amp;apos;" does not become an apostrophe.
  return Object.entries(ENTITIES).reduce(
    (out, [entity, char]) => out.split(entity).join(char),
    input,
  );
}
