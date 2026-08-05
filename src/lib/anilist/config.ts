import { OAUTH, backendUrl } from "@/lib/brand";

export const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
export const ANILIST_AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
export const ANILIST_PIN_REDIRECT_URI = "https://anilist.co/api/v2/oauth/pin";
export const ANILIST_DEVELOPER_URL = "https://anilist.co/settings/developer";

/** Register your own client at ANILIST_DEVELOPER_URL. */
export const ANILIST_CLIENT_ID = OAUTH.anilistClientId;

// The code -> token step carries the client secret, so it cannot run in the
// client and has to be proxied by a server you control.
export const ANILIST_TOKEN_EXCHANGE_URL = backendUrl("/v1/anilist/token");

export const ANILIST_CONFIGURED = Boolean(ANILIST_CLIENT_ID && ANILIST_TOKEN_EXCHANGE_URL);
