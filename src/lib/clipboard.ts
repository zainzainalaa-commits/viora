/**
 * Reading what the viewer copied, on a device where the page may not.
 *
 * Measured in the Android WebView this app ships in: `navigator.clipboard`
 * exists, `isSecureContext` is true, and `readText()` rejects with "Read
 * permission denied" — there is no prompt to grant and no flag to set from the
 * page. So on Android the activity exposes the system clipboard directly and
 * this picks whichever route actually works.
 *
 * It matters most where typing is worst: an add-on's manifest URL is a hundred
 * characters of base64 that nobody will spell out on a grid of letters with a
 * D-pad.
 */

type NativeClipboard = { read: () => string; write: (text: string) => boolean };

function native(): NativeClipboard | null {
  const bridge = (window as unknown as { VioraClipboard?: NativeClipboard }).VioraClipboard;
  return bridge && typeof bridge.read === "function" ? bridge : null;
}

/** True when something can be pasted at all — so a Paste button is only offered
 *  where it will work rather than failing under the viewer's hand. */
export function canPaste(): boolean {
  return !!native() || !!navigator.clipboard?.readText;
}

export async function readClipboard(): Promise<string> {
  const bridge = native();
  if (bridge) {
    try {
      return bridge.read() ?? "";
    } catch {
      return "";
    }
  }
  try {
    return (await navigator.clipboard.readText()) ?? "";
  } catch {
    return "";
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  const bridge = native();
  if (bridge?.write) {
    try {
      return bridge.write(text);
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
