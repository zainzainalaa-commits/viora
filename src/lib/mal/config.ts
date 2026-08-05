import { OAUTH, backendUrl } from "@/lib/brand";

export const MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
export const MAL_API_BASE = "https://api.myanimelist.net/v2";
export const MAL_DEVELOPER_URL = "https://myanimelist.net/apiconfig";

/** Register your own app at MAL_DEVELOPER_URL. */
export const MAL_CLIENT_ID = OAUTH.malClientId;

// MyAnimeList validates this against the registration that owns the client ID,
// so it has to be a URL on your own domain.
export const MAL_REDIRECT_URI = OAUTH.malRedirectUri;

export const MAL_TOKEN_PROXY = backendUrl("/api/mal/token");

export const MAL_CONFIGURED = Boolean(MAL_CLIENT_ID && MAL_REDIRECT_URI && MAL_TOKEN_PROXY);
