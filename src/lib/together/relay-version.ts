import { PUBLIC_RELAY_URL } from "@/lib/brand";

export const REQUIRED_RELAY_VERSION = 10;

/** Null until you deploy a relay. Self-hosted and LAN relays still work. */
export const HARBOR_PUBLIC_RELAY = PUBLIC_RELAY_URL;

export function relayOutdated(version: number | null | undefined): boolean {
  return version == null || version < REQUIRED_RELAY_VERSION;
}

function hostOf(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^(wss?|https?):\/\//, "")
    .replace(/\/.*$/, "");
}

export function isPublicRelay(url: string): boolean {
  if (!PUBLIC_RELAY_URL) return false;
  return hostOf(url) === hostOf(PUBLIC_RELAY_URL);
}
