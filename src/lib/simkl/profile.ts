import { simklRequest } from "./client";

type SimklSettings = {
  user?: {
    name?: string;
    avatar?: string | null;
  };
};

export async function fetchSimklAvatar(): Promise<string | null> {
  try {
    const settings = await simklRequest<SimklSettings>("/users/settings", { method: "POST" });
    return settings.user?.avatar ?? null;
  } catch {
    return null;
  }
}
