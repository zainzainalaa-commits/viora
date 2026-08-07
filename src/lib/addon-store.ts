import { safeFetch as fetch } from "@/lib/safe-fetch";
import { readActiveStremioAuthKey } from "./auth";
import { setUserAddons, userAddons, type Addon } from "./addons";
import { applyOrderToItems } from "./addons-store/reorder";

const STORAGE_KEY = "harbor.installed-addons";
const DISABLED_KEY = "harbor.addons.disabled";

/**
 * Addons that ship inside the app rather than being fetched from a server.
 *
 * They are reached over `local://`, which is answered in-process, so there is
 * no server to add and nothing to download. "Installed" and "uninstalled" do
 * not describe anything real for them — the code is in the binary either way.
 * The only honest control is on and off, which is why they are never removable
 * and always reappear if a list somewhere says otherwise.
 */
const BUILT_IN_ADDONS: Array<{ id: string; transportUrl: string }> = [
  { id: "community.cinemana", transportUrl: "local://cinemana/manifest.json" },
];

export function isBuiltInAddon(transportUrl: string | undefined | null): boolean {
  return !!transportUrl && transportUrl.startsWith("local://");
}

/**
 * Puts every built-in addon back in the list, on every start.
 *
 * The previous version seeded once and wrote a flag, so anything the user
 * removed stayed removed for good — which is right for a suggested default and
 * wrong for something shipped as part of the app. Running each boot is what
 * makes "not removable" true rather than merely intended, and it repairs
 * profiles that lost the entry before this change.
 *
 * The disabled set is deliberately untouched: restoring the entry must not
 * quietly switch the addon back on for someone who turned it off.
 */
export async function ensureBuiltInAddons(): Promise<void> {
  for (const def of BUILT_IN_ADDONS) {
    try {
      // Fetched before the list is read, so that reading, changing and writing
      // happen with no await in between. With the await in the middle, two
      // overlapping calls both saw "not installed" and both appended - which is
      // not hypothetical: StrictMode runs the effect twice in development and
      // produced exactly that duplicate.
      const manifest = await fetchManifestAt(def.transportUrl);

      const installed = loadInstalled();
      const at = installed.findIndex((a) => a.transportUrl === def.transportUrl);

      if (at >= 0) {
        // Refresh the manifest so a shipped change to the catalogue appears
        // without the user doing anything, and keep the position they dragged
        // it to. Any later copies are collapsed, repairing lists that a
        // previous version of this function duplicated.
        installed[at] = { ...installed[at], id: manifest.id || def.id, manifest };
        const deduped = installed.filter((a, i) => a.transportUrl !== def.transportUrl || i === at);
        saveInstalled(deduped);
        continue;
      }

      installed.push({
        id: manifest.id || def.id,
        transportUrl: def.transportUrl,
        installedAt: Date.now(),
        manifest,
      });
      saveInstalled(installed);
    } catch (e) {
      // A local manifest cannot fail for network reasons, so this means a real
      // bug. Leaving it to the next boot is better than writing a broken entry.
      console.warn(`[addons] could not restore built-in ${def.id}`, e);
    }
  }
}

function readAuthKey(): string | null {
  return readActiveStremioAuthKey();
}

async function pushToStremio(addon: Addon, mode: "install" | "uninstall"): Promise<boolean> {
  // A `local://` URL means nothing outside this app. Syncing one to a Stremio
  // account would put an entry in the user's cloud list that no other client
  // could ever resolve.
  if (isBuiltInAddon(addon.transportUrl)) return true;
  const authKey = readAuthKey();
  if (!authKey) return true;
  try {
    const current = await userAddons(authKey);
    const filtered = current.filter((a) => a.transportUrl !== addon.transportUrl);
    const next = mode === "install" ? [...filtered, addon] : filtered;
    return await setUserAddons(authKey, next);
  } catch {
    return false;
  }
}

export type InstalledAddon = {
  id: string;
  transportUrl: string;
  installedAt: number;
  manifest?: Addon["manifest"];
};

const SLIM_MANIFEST_KEYS = [
  "id",
  "name",
  "version",
  "description",
  "logo",
  "background",
  "types",
  "idPrefixes",
  "resources",
  "catalogs",
  "behaviorHints",
] as const;

function slimManifest(manifest: Addon["manifest"] | undefined): Addon["manifest"] | undefined {
  if (!manifest) return undefined;
  const src = manifest as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SLIM_MANIFEST_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    if (k === "description" && typeof v === "string") {
      out[k] = v.slice(0, 400);
      continue;
    }
    if (k === "logo" && typeof v === "string" && v.startsWith("data:")) {
      continue;
    }
    if (k === "background" && typeof v === "string" && v.startsWith("data:")) {
      continue;
    }
    if (k === "catalogs" && Array.isArray(v)) {
      out[k] = (v as Array<Record<string, unknown>>).map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        extra: Array.isArray(c.extra)
          ? (c.extra as Array<Record<string, unknown>>).map((e) => ({
              name: e.name,
              isRequired: e.isRequired,
            }))
          : undefined,
      }));
      continue;
    }
    out[k] = v;
  }
  return out as Addon["manifest"];
}

export function loadInstalled(): InstalledAddon[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as InstalledAddon[];
  } catch {
    return [];
  }
}

function saveInstalled(list: InstalledAddon[]) {
  const slim = list.map((a) => ({ ...a, manifest: slimManifest(a.manifest) }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      const stripped = list.map((a) => ({
        id: a.id,
        transportUrl: a.transportUrl,
        installedAt: a.installedAt,
      }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      } catch (e2) {
        console.warn("[addons] localStorage still full after stripping manifests", e2);
      }
    } else {
      throw e;
    }
  }
}

export function reorderInstalled(urlSequence: string[]): void {
  const items = loadInstalled();
  if (items.length < 2) return;
  saveInstalled(applyOrderToItems(items, urlSequence));
}

export function loadDisabledAddons(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((u): u is string => typeof u === "string"));
  } catch {
    return new Set();
  }
}

function saveDisabledAddons(set: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
  } catch (e) {
    console.warn("[addons] couldn't persist disabled addons", e);
  }
}

export function isAddonEnabled(transportUrl: string): boolean {
  return !loadDisabledAddons().has(transportUrl);
}

export function setAddonEnabled(transportUrl: string, enabled: boolean): void {
  const set = loadDisabledAddons();
  if (enabled) set.delete(transportUrl);
  else set.add(transportUrl);
  saveDisabledAddons(set);
}

export function filterEnabled<T extends { transportUrl: string }>(items: T[]): T[] {
  const disabled = loadDisabledAddons();
  if (disabled.size === 0) return items;
  return items.filter((a) => !disabled.has(a.transportUrl));
}

export function isInstalled(id: string): boolean {
  return loadInstalled().some((a) => a.id === id);
}

export function transportUrlFor(id: string): string | null {
  return loadInstalled().find((a) => a.id === id)?.transportUrl ?? null;
}

function transportHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function findHostnameMatch(transportUrl: string): InstalledAddon | null {
  const host = transportHost(transportUrl);
  if (!host) return null;
  return loadInstalled().find((a) => transportHost(a.transportUrl) === host) ?? null;
}

export type AddonUrlParse =
  | { kind: "ok"; url: string }
  | { kind: "error"; message: string };

export function parseAddonUrl(input: string): AddonUrlParse {
  let raw = input.trim();
  if (!raw) return { kind: "error", message: "Paste a manifest URL or stremio:// link." };
  if (raw.startsWith("stremio://")) raw = "https://" + raw.slice("stremio://".length);
  raw = raw.replace(/\/#\/configure\/?$/, "");
  raw = raw.replace(/\/configure\/?$/, "");
  raw = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    return { kind: "error", message: "URL must start with https:// or stremio://" };
  }
  if (!/manifest\.json(\?.*)?$/i.test(raw)) {
    raw = raw + "/manifest.json";
  }
  try {
    new URL(raw);
  } catch {
    return { kind: "error", message: "That doesn't look like a valid URL." };
  }
  return { kind: "ok", url: raw };
}

function validateManifest(m: unknown): { ok: true; manifest: Addon["manifest"] } | { ok: false; error: string } {
  if (!m || typeof m !== "object") return { ok: false, error: "Manifest is not a JSON object." };
  const obj = m as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) return { ok: false, error: "Manifest is missing an `id`." };
  if (typeof obj.name !== "string" || obj.name.length === 0) return { ok: false, error: "Manifest is missing a `name`." };
  return { ok: true, manifest: obj as Addon["manifest"] };
}

export async function fetchManifestAt(transportUrl: string): Promise<Addon["manifest"]> {
  const res = await fetch(transportUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    // The URL is part of the message on purpose. What the user pasted and what
    // was actually requested are not the same string — a base URL gains
    // `/manifest.json`, a `stremio://` link changes scheme, `/configure` is
    // stripped — so "check the URL" without saying which URL leaves them
    // checking the one thing that was already correct.
    throw new Error(`Manifest fetch failed (HTTP ${res.status}) for ${transportUrl}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(
      `Response from ${transportUrl} wasn't valid JSON. The URL may not be a Stremio manifest.`,
    );
  }
  const v = validateManifest(json);
  if (!v.ok) throw new Error(v.error);
  return v.manifest;
}

export type InstallResult = {
  addon: Addon;
  syncedToStremio: boolean;
  replaced: boolean;
};

export async function installAddon(id: string, transportUrl: string): Promise<Addon> {
  const manifest = await fetchManifestAt(transportUrl);
  const canonicalId = manifest.id || id;
  const next = loadInstalled().filter((a) => a.transportUrl !== transportUrl);
  next.push({ id: canonicalId, transportUrl, installedAt: Date.now(), manifest });
  saveInstalled(next);
  const addon: Addon = { manifest, transportUrl };
  await pushToStremio(addon, "install");
  return addon;
}

export async function installFromUrl(
  rawUrl: string,
  options: { replaceId?: string } = {},
): Promise<InstallResult> {
  const parsed = parseAddonUrl(rawUrl);
  if (parsed.kind === "error") throw new Error(parsed.message);
  const manifest = await fetchManifestAt(parsed.url);
  const id = manifest.id;
  const before = loadInstalled();
  const replaceId = options.replaceId && options.replaceId !== id ? options.replaceId : null;
  const replacedById = before.some((a) => a.id === id);
  const replacedByOld = replaceId != null && before.some((a) => a.id === replaceId);
  const next = before.filter((a) => a.transportUrl !== parsed.url && (!replaceId || a.id !== replaceId));
  next.push({ id, transportUrl: parsed.url, installedAt: Date.now(), manifest });
  saveInstalled(next);
  const addon: Addon = { manifest, transportUrl: parsed.url };
  const syncedToStremio = await pushToStremio(addon, "install");
  if (replaceId && replaceId !== id) {
    const authKey = readAuthKey();
    if (authKey) {
      try {
        const current = await userAddons(authKey);
        const trimmed = current.filter((a) => a.manifest.id !== replaceId);
        if (trimmed.length !== current.length) {
          await setUserAddons(authKey, trimmed);
        }
      } catch {
        /* noop */
      }
    }
  }
  return { addon, syncedToStremio, replaced: replacedById || replacedByOld };
}

/** Resolves true when the addon was actually removed, false when it is built in. */
export async function uninstallAddon(id: string, transportUrl?: string): Promise<boolean> {
  const removed = transportUrl
    ? loadInstalled().filter((a) => a.transportUrl === transportUrl)
    : loadInstalled().filter((a) => a.id === id);

  // Enforced here rather than only in the UI. Uninstalling a built-in would
  // succeed for exactly one boot and then be undone by ensureBuiltInAddons,
  // which looks like the app ignoring the user. Refusing outright is honest,
  // and it also covers the other callers: the settings panel, and anything that
  // removes an addon as a side effect of replacing one.
  if (removed.some((a) => isBuiltInAddon(a.transportUrl))) {
    console.warn(`[addons] ${id} ships with the app and cannot be removed; turn it off instead`);
    return false;
  }
  const next = transportUrl
    ? loadInstalled().filter((a) => a.transportUrl !== transportUrl)
    : loadInstalled().filter((a) => a.id !== id);
  saveInstalled(next);
  if (removed.length > 0) {
    const disabled = loadDisabledAddons();
    let touched = false;
    for (const a of removed) if (disabled.delete(a.transportUrl)) touched = true;
    if (touched) saveDisabledAddons(disabled);
  }
  const authKey = readAuthKey();
  if (!authKey) return true;
  const current = await userAddons(authKey).catch(() => [] as Addon[]);
  const filtered = transportUrl
    ? current.filter((a) => a.transportUrl !== transportUrl)
    : current.filter((a) => a.manifest.id !== id);
  if (filtered.length !== current.length) {
    await setUserAddons(authKey, filtered).catch(() => {});
  }
  return true;
}

export async function fetchInstalledAddons(): Promise<Addon[]> {
  const list = loadInstalled();
  if (list.length === 0) return [];
  const tasks = list.map(async (entry): Promise<Addon | null> => {
    if (entry.manifest) {
      return { manifest: entry.manifest, transportUrl: entry.transportUrl };
    }
    try {
      const manifest = await fetchManifestAt(entry.transportUrl);
      const updated = loadInstalled().map((e) =>
        e.id === entry.id ? { ...e, manifest } : e,
      );
      saveInstalled(updated);
      return { manifest, transportUrl: entry.transportUrl };
    } catch {
      return null;
    }
  });
  const results = await Promise.all(tasks);
  return results.filter((a): a is Addon => a !== null);
}

export function manifestToConfigureUrl(transportUrl: string): string {
  return transportUrl.replace(/manifest\.json(\?.*)?$/i, "configure");
}

export function manifestToShareUrl(transportUrl: string, scheme: "https" | "stremio" = "https"): string {
  if (scheme === "stremio") {
    return transportUrl.replace(/^https?:\/\//i, "stremio://");
  }
  return transportUrl;
}

export function cometConfigFor(debridService: string, apiKey: string): string {
  const settings = {
    maxResultsPerResolution: 0,
    maxSize: 0,
    cachedOnly: false,
    sortCachedUncachedTogether: false,
    removeTrash: true,
    resultFormat: ["all"],
    debridServices: [{ service: debridService, apiKey: apiKey.trim() }],
    enableTorrent: true,
    deduplicateStreams: true,
    scrapeDebridAccountTorrents: false,
    debridStreamProxyPassword: "",
    languages: { required: [], allowed: [], exclude: [], preferred: [] },
    resolutions: {},
    options: {
      remove_ranks_under: -10000000000,
      allow_english_in_languages: false,
      remove_unknown_languages: false,
    },
  };
  return btoa(JSON.stringify(settings));
}

export function cometUrlFor(debridService: string, apiKey: string): string {
  const b64 = cometConfigFor(debridService, apiKey);
  return `https://comet.elfhosted.com/${b64}/manifest.json`;
}

export const COMET_ID = "comet.elfhosted.com";

export function cometKeyFromUrl(transportUrl: string): { service: string; apiKey: string } | null {
  const m = transportUrl.match(/comet\.elfhosted\.com\/([^/]+)\/manifest\.json/);
  if (!m) return null;
  try {
    const json = JSON.parse(atob(m[1]));
    const svc = json?.debridServices?.[0];
    if (!svc?.service || !svc?.apiKey) return null;
    return { service: svc.service, apiKey: svc.apiKey };
  } catch {
    return null;
  }
}
