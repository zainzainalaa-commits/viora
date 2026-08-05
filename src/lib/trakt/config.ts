import { OAUTH, backendUrl } from "@/lib/brand";

export const TRAKT_API_BASE = "https://api.trakt.tv";
export const TRAKT_API_VERSION = "2";

/** Register your own app at https://trakt.tv/oauth/applications. */
export const TRAKT_CLIENT_ID = OAUTH.traktClientId;

// Trakt's token exchange needs the client secret, which cannot ship inside a
// client app, so it has to happen on a server you control.
export const TRAKT_TOKEN_PROXY = backendUrl("/api/trakt/token");
export const TRAKT_DEVICE_TOKEN_PROXY = backendUrl("/api/trakt/device-token");

/** False until both a client ID and a token proxy are configured. */
export const TRAKT_CONFIGURED = Boolean(TRAKT_CLIENT_ID && TRAKT_TOKEN_PROXY);

export const TRAKT_VERIFY_URL = "https://trakt.tv/activate";
export const REFRESH_THRESHOLD_SEC = 14 * 24 * 60 * 60;
export const WRITE_MIN_INTERVAL_MS = 1000;
