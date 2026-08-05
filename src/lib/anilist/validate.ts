import { AnilistApiError } from "./client";
import { fetchViewer } from "./queries";
import { getSession, setSession } from "./session";

let inflight: Promise<void> | null = null;

export function validateAnilistSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    const viewer = await fetchViewer(session.accessToken);
    if (viewer.avatar && viewer.avatar !== session.avatar) {
      setSession({ ...session, avatar: viewer.avatar });
    }
  } catch (e) {
    if (e instanceof AnilistApiError && e.status === 401) setSession(null);
  }
}
