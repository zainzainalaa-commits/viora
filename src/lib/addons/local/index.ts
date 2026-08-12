import { alboxAddon } from "./albox";
import { cinemanaAddon } from "./cinemana";
import type { LocalAddon } from "./types";

/**
 * Addons that ship with the app. They are reached through `local://<name>/…`
 * transport URLs, which `safeFetch` recognises and routes here instead of over
 * the network — everything else in the app just sees an ordinary addon.
 */

export const LOCAL_SCHEME = "local://";

const REGISTRY: LocalAddon[] = [cinemanaAddon, alboxAddon];

export function localAddons(): LocalAddon[] {
  return REGISTRY;
}

export function isLocalAddonUrl(url: string): boolean {
  return url.startsWith(LOCAL_SCHEME);
}

export function localTransportUrl(addon: LocalAddon): string {
  return `${LOCAL_SCHEME}${addon.name}/manifest.json`;
}

/** Turns `/skip=30/search=batman` into `{ skip: "30", search: "batman" }`. */
function parseExtra(segments: string[]): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const seg of segments) {
    const eq = seg.indexOf("=");
    if (eq <= 0) continue;
    extra[decodeURIComponent(seg.slice(0, eq))] = decodeURIComponent(seg.slice(eq + 1));
  }
  return extra;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Serves one addon request. Mirrors the Stremio URL layout:
 *   /manifest.json
 *   /catalog/:type/:id.json            (+ optional /key=value segments)
 *   /meta/:type/:id.json
 *   /stream/:type/:id.json
 *   /subtitles/:type/:id.json
 */
export async function handleLocalAddonRequest(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const withoutScheme = url.slice(LOCAL_SCHEME.length);
  const slash = withoutScheme.indexOf("/");
  const name = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash);
  const path = slash === -1 ? "" : withoutScheme.slice(slash + 1);

  const addon = REGISTRY.find((a) => a.name === name);
  if (!addon) return json({ error: `unknown local addon: ${name}` }, 404);

  if (path === "manifest.json" || path === "") return json(addon.manifest);

  const parts = path.split("/").filter(Boolean);
  const [resource, type, ...rest] = parts;
  if (!resource || !type || rest.length === 0) return json({ error: "bad request" }, 400);

  // The id segment carries the `.json` suffix; extras follow it.
  const idSegment = rest[0].replace(/\.json$/, "");
  const id = decodeURIComponent(idSegment);
  const extra = parseExtra(rest.slice(1).map((s) => s.replace(/\.json$/, "")));

  try {
    switch (resource) {
      case "catalog":
        if (!addon.catalog) return json({ metas: [] });
        return json(await addon.catalog({ type, id, extra, signal }));
      case "meta":
        if (!addon.meta) return json({ meta: null });
        return json(await addon.meta({ type, id, signal }));
      case "stream":
        if (!addon.stream) return json({ streams: [] });
        return json(await addon.stream({ type, id, signal }));
      case "subtitles":
        if (!addon.subtitles) return json({ subtitles: [] });
        return json(await addon.subtitles({ type, id, signal }));
      default:
        return json({ error: `unsupported resource: ${resource}` }, 404);
    }
  } catch (e) {
    // Upstream outages are routine here; answer empty rather than throwing so a
    // single failing source cannot take down a catalog row or a stream list.
    console.warn(`[local-addon] ${name}/${resource} failed`, e);
    const empty =
      resource === "catalog"
        ? { metas: [] }
        : resource === "stream"
          ? { streams: [] }
          : resource === "subtitles"
            ? { subtitles: [] }
            : { meta: null };
    return json(empty);
  }
}

export type { LocalAddon } from "./types";
