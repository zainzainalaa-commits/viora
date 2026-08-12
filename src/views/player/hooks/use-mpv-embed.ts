import type { PlayerEngine } from "@/lib/player/bridge";
import { useEffect } from "react";
import { isLinuxDesktop } from "@/lib/platform";
import type { Settings } from "@/lib/settings";

/**
 * Marks the document while mpv is drawing into the page rather than over it.
 *
 * The second half of this hook used to keep a transparent overlay *window*
 * glued to the main window as it moved and resized. That window was a desktop
 * construct; on Android there is one WebView and nothing to follow, so only the
 * attribute survives.
 */
export function useMpvEmbed(params: { engine: PlayerEngine; settings: Settings }) {
  const { engine, settings } = params;

  useEffect(() => {
    if (engine !== "mpv" || !settings.playerMpvEmbed || !isLinuxDesktop()) return;
    document.documentElement.dataset.mpvEmbed = "1";
    return () => {
      delete document.documentElement.dataset.mpvEmbed;
    };
  }, [engine, settings.playerMpvEmbed]);
}
