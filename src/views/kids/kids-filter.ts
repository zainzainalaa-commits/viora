import type { Meta } from "@/lib/cinemeta";

export function dropUnreleased(metas: Meta[]): Meta[] {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yearNow = now.getUTCFullYear();
  return metas.filter((m) => {
    if (m.releaseDate) return m.releaseDate.slice(0, 10) <= today;
    const y = m.releaseInfo ? parseInt(m.releaseInfo.slice(0, 4), 10) : NaN;
    return !Number.isFinite(y) || y <= yearNow;
  });
}
