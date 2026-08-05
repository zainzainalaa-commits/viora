/**
 * Contract for addons that run inside the app instead of over the network.
 *
 * A local addon answers the same four Stremio resources a remote one does, so
 * every consumer downstream — catalog rows, the detail page, the stream
 * pipeline, subtitle selection — works against it unchanged.
 */

export type LocalAddonManifest = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  types?: string[];
  idPrefixes?: string[];
  resources?: Array<string | { name: string; types?: string[]; idPrefixes?: string[] }>;
  catalogs?: Array<{
    id: string;
    type: string;
    name: string;
    extra?: Array<{ name: string; isRequired?: boolean; options?: string[] }>;
  }>;
  behaviorHints?: Record<string, unknown>;
};

export type CatalogArgs = {
  type: string;
  id: string;
  /** Parsed from the trailing `/key=value` segments of the request path. */
  extra?: Record<string, string>;
  signal?: AbortSignal;
};

export type ResourceArgs = {
  type: string;
  id: string;
  signal?: AbortSignal;
};

export type LocalAddon = {
  /** Host portion of the `local://<name>/…` transport URL. */
  name: string;
  manifest: LocalAddonManifest;
  catalog?: (args: CatalogArgs) => Promise<{ metas: unknown[] }>;
  meta?: (args: ResourceArgs) => Promise<{ meta: unknown }>;
  stream?: (args: ResourceArgs) => Promise<{ streams: unknown[] }>;
  subtitles?: (args: ResourceArgs) => Promise<{ subtitles: unknown[] }>;
};
