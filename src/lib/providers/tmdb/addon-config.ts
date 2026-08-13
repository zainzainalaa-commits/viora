/**
 * Reading the settings a TMDB addon carries in its own URL.
 *
 * The addon is configured on a web page and the result is packed into the
 * manifest URL itself: `https://…/N4IgTgDgJgRg…/manifest.json`. Inside is the
 * viewer's own TMDB key and the language they chose — which is why being asked
 * for that key again, by hand, in this app's settings reads as the app not
 * paying attention.
 *
 * The packing is lz-string's URI-safe variant. The decoder is here rather than
 * as a dependency because the package manager in this repo refuses new
 * sub-dependencies, and this is forty lines of a published, stable format.
 */

const URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

function decompress(length: number, resetValue: number, getNextValue: (i: number) => number): string | null {
  const dictionary: string[] = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  const result: string[] = [];
  let bits = 0;
  let maxpower = 2 ** 2;
  let power = 1;
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (let i = 0; i < 3; i += 1) dictionary[i] = String(i);

  while (power !== maxpower) {
    const resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.val = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  let c: string;
  switch (bits) {
    case 0:
    case 1: {
      const width = bits === 0 ? 8 : 16;
      bits = 0;
      maxpower = 2 ** width;
      power = 1;
      while (power !== maxpower) {
        const resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    }
    case 2:
      return "";
    default:
      return null;
  }

  dictionary[3] = c;
  let w = c;
  result.push(c);

  for (;;) {
    if (data.index > length) return "";

    bits = 0;
    maxpower = 2 ** numBits;
    power = 1;
    while (power !== maxpower) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    let cc = bits;
    switch (cc) {
      case 0:
      case 1: {
        const width = cc === 0 ? 8 : 16;
        bits = 0;
        maxpower = 2 ** width;
        power = 1;
        while (power !== maxpower) {
          const resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        cc = dictSize - 1;
        enlargeIn -= 1;
        break;
      }
      case 2:
        return result.join("");
      default:
        break;
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }

    if (dictionary[cc] !== undefined) {
      entry = dictionary[cc];
    } else if (cc === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return null;
    }

    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn -= 1;
    w = entry;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
  }
}

function decompressFromEncodedURIComponent(input: string): string | null {
  if (!input) return null;
  const value = input.replace(/ /g, "+");
  return decompress(value.length, 32, (index) => URI_SAFE.indexOf(value.charAt(index)));
}

export type TmdbAddonConfig = {
  /** The viewer's own TMDB v3 key, as entered on the addon's configure page. */
  tmdbApiKey?: string;
  /** A TMDB language tag such as `ar-AE`. */
  language?: string;
};

/** Recognises the addon by what its URL is shaped like, not by a fixed host. */
export function isTmdbAddonUrl(url: string | undefined | null): boolean {
  return !!url && /tmdb/i.test(url) && url.includes("/manifest.json");
}

/**
 * The configuration packed into a TMDB addon's manifest URL, if it is there.
 *
 * Returns null for an addon configured with the host's own key, which carries
 * nothing personal in its URL — there is no key to adopt in that case, and
 * pretending otherwise would be worse than asking.
 */
export function tmdbAddonConfig(transportUrl: string): TmdbAddonConfig | null {
  const encoded = transportUrl.split("/").find((part) => part.length > 40 && !part.includes("."));
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as TmdbAddonConfig;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}
