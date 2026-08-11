/**
 * Signing in to Stremio from a device with no keyboard.
 *
 * Stremio runs a small pairing service for exactly this: the television asks for
 * a code, shows it, and waits; the viewer opens the link on a phone where typing
 * an email and a password is ordinary, and the television is handed the auth key
 * when they approve. It is the flow every TV app uses, and it is theirs, so no
 * credential ever passes through this app.
 *
 * Measured against the live service:
 *   POST https://link.stremio.com/api/create
 *     -> { success, code: "BFU9", link: "https://link.stremio.com/BFU9",
 *          qrcode: "https://link.stremio.com/qr?data=…" }
 *   GET  https://link.stremio.com/api/read?code=BFU9   (before approval)
 *     -> { result: null, error: { code: 101, message: "Invalid or expired token" } }
 *
 * The pending answer is what the polling turns on, and it is measured. The shape
 * of the approved answer is not — it needs a real phone signing in to a real
 * account — so the reader accepts the auth key wherever the service chooses to
 * put it rather than insisting on one field.
 */

const LINK_API = "https://link.stremio.com/api";

export type LoginLink = {
  /** Four characters, shown for anyone who would rather type than scan. */
  code: string;
  /** Where the phone goes. */
  link: string;
  /** An image URL of the QR for `link` — the service renders it, so there is no
   *  QR library in the app for one screen. */
  qrcode: string;
};

export async function createLoginLink(signal?: AbortSignal): Promise<LoginLink> {
  const res = await fetch(`${LINK_API}/create`, { method: "POST", signal });
  const json = (await res.json()) as {
    code?: string;
    link?: string;
    qrcode?: string;
    result?: { code?: string; link?: string; qrcode?: string };
  };
  const src = json.result ?? json;
  if (!src.code || !src.link) throw new Error("Stremio did not return a pairing code");
  return {
    code: src.code,
    link: src.link,
    qrcode: src.qrcode ?? `${LINK_API.replace("/api", "")}/qr?data=${encodeURIComponent(src.link)}`,
  };
}

/** The auth key once the phone has approved, or null while it has not. */
export async function readLoginLink(code: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${LINK_API}/read?code=${encodeURIComponent(code)}`, { signal });
  const json = (await res.json()) as {
    result?: unknown;
    error?: { code?: number; message?: string };
  };
  // 101 is what an unapproved code answers with. Anything else that carries no
  // key is also treated as "not yet": a transient failure must not end the wait
  // on a screen whose only other option is to start over.
  const result = json.result;
  if (!result) return null;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const field of ["authKey", "auth_key", "key"]) {
      const v = r[field];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}
