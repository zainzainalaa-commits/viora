/**
 * App identity and every outbound service endpoint, in one place.
 *
 * This fork does not run the upstream project's servers, so anything that used
 * to point at them is either routed through `BACKEND_BASE` (once you stand one
 * up) or switched off via `FEATURES`. Nothing here should ever be hardcoded to
 * a third party's infrastructure again.
 */

/** Change these three when the product name is decided. */
export const APP_NAME = "Harbor";
export const APP_IDENTIFIER = "app.harbor";
export const APP_SCHEME = "harbor";

/**
 * Your own backend, if and when you deploy one. Null means "not configured":
 * every feature that needs it stays off and makes no network call at all.
 *
 * The endpoints below expect these routes:
 *   POST /v1/feedback              bug reports
 *   POST /v1/adreport              ad-segment reports
 *   POST /v1/anilist/token         AniList OAuth code -> token exchange
 *   POST /api/trakt/token          Trakt OAuth code -> token exchange
 *   POST /api/trakt/device-token   Trakt device-flow polling
 *   POST /api/mal/token            MyAnimeList OAuth (PKCE) exchange
 *   GET  /api/imdb/episodes/:tt    IMDb episode ratings
 *   GET  /api/imdb/parental/:tt    IMDb parental guide
 *   GET  /api/tvdb/images          TVDB artwork proxy
 *   GET  /updates/latest.json      updater manifest
 *   GET  /updates/ad-segments.json shared ad-segment corpus
 */
export const BACKEND_BASE: string | null = null;

/** Watch-party relay (WebSocket). Null disables hosting/joining public rooms. */
export const PUBLIC_RELAY_URL: string | null = null;

/** Web app origin used to build shareable invite links. */
export const WEB_APP_BASE: string | null = null;

/** Public site, used for OAuth referrers and "learn more" links. */
export const WEBSITE_URL: string | null = null;

/** Source repository, shown in About. Null hides the link. */
export const REPO_URL: string | null = null;

/** Support inbox. Null hides every "email us" affordance. */
export const SUPPORT_EMAIL: string | null = null;

/**
 * Third-party OAuth client IDs. These must be registered to YOU: the provider
 * validates the redirect URI against the account that owns the client ID, so a
 * borrowed ID fails the moment the redirect no longer matches its owner.
 * Empty string means "not registered yet" and disables that integration.
 */
export const OAUTH = {
  traktClientId: "",
  anilistClientId: "",
  malClientId: "",
  /** Must exactly match what you registered with MyAnimeList. */
  malRedirectUri: "",
} as const;

/**
 * Features that cannot work without infrastructure you control. Flip one to
 * true only once its endpoint above is actually serving.
 */
export const FEATURES = {
  /** Crash and bug report submission. */
  bugReports: false,
  /** In-app feedback form. */
  feedback: false,
  /** Reporting ad segments back to the shared corpus. */
  adReports: false,
  /** Downloading the shared ad-segment corpus for skip-intro. */
  adCorpus: false,
  /** Public watch-party relay. LAN/self-hosted relays are unaffected. */
  publicRelay: false,
  /** IMDb episode ratings and parental guide (needs a scraping proxy). */
  imdbProxy: false,
  /** TVDB artwork (needs a paid TVDB key held server-side). */
  tvdbProxy: false,
  /** Community theme gallery. */
  themeStore: false,
  /** In-app updater. Leave false on Android: the store or sideload handles it. */
  autoUpdate: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function featureEnabled(name: FeatureName): boolean {
  return FEATURES[name];
}

/** Joins a path onto BACKEND_BASE, or returns null when unconfigured. */
export function backendUrl(path: string): string | null {
  if (!BACKEND_BASE) return null;
  return `${BACKEND_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
