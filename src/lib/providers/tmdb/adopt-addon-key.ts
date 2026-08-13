import { fetchInstalledAddons } from "@/lib/addon-store";
import { userAddons, type Addon } from "@/lib/addons";
import { isTmdbAddonUrl, tmdbAddonConfig } from "./addon-config";

/**
 * Takes the TMDB key from the addon the viewer already installed.
 *
 * Installing the TMDB addon means entering a key on its configure page; the key
 * then travels inside the addon's own manifest URL. Asking for it a second time
 * in this app's settings — from a sofa, on an on-screen keyboard, thirty-two
 * characters of hex — is asking for something already given.
 *
 * Only ever fills a blank. A key typed here is the viewer's own decision and is
 * never overwritten, and neither is a metadata language they have set.
 */
export async function adoptTmdbFromAddon(
  authKey: string | null,
  current: { tmdbKey: string; tmdbLanguage: string },
  apply: (next: { tmdbKey?: string; tmdbLanguage?: string }) => void,
): Promise<void> {
  if (current.tmdbKey.trim()) return;

  let addons: Addon[] = [];
  try {
    const [account, installed] = await Promise.all([
      authKey ? userAddons(authKey).catch(() => [] as Addon[]) : Promise.resolve([] as Addon[]),
      fetchInstalledAddons().catch(() => [] as Addon[]),
    ]);
    addons = [...account, ...installed];
  } catch {
    return;
  }

  for (const addon of addons) {
    if (!isTmdbAddonUrl(addon.transportUrl)) continue;
    const config = tmdbAddonConfig(addon.transportUrl);
    const key = config?.tmdbApiKey?.trim();
    if (!key) continue;

    const next: { tmdbKey?: string; tmdbLanguage?: string } = { tmdbKey: key };
    // The language too, when nothing has been chosen here: it is the same
    // answer to the same question, given on the same page.
    if (!current.tmdbLanguage.trim() && config?.language?.trim()) {
      next.tmdbLanguage = config.language.trim();
    }
    console.info(`[tmdb] adopted the key from ${addon.manifest.name}`);
    apply(next);
    return;
  }
}
