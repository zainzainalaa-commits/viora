export function realQualityLabel(width: number, height: number): string | null {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 && h <= 0) return null;
  if (h >= 2160 || w >= 3840) return "4K";
  if (h >= 1440 || w >= 2560) return "1440p";
  if (h >= 1080 || w >= 1920) return "1080p";
  if (h >= 720 || w >= 1280) return "720p";
  if (h >= 480 || w >= 854) return "480p";
  return "SD";
}
