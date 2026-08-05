import { traktRequest } from "./client";

type TraktProfile = {
  username?: string;
  name?: string | null;
  images?: {
    avatar?: { full?: string | null };
  };
};

export async function fetchTraktAvatar(): Promise<string | null> {
  try {
    const profile = await traktRequest<TraktProfile>("/users/me?extended=full");
    return profile.images?.avatar?.full ?? null;
  } catch {
    return null;
  }
}
