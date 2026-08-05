/**
 * The app mark: a "V" cut out of a rounded tile.
 *
 * Kept at this path under this export name so the ~40 call sites across the ten
 * chrome themes keep working untouched — only the artwork changed. The cutout
 * uses the canvas colour so the V reads as negative space on any theme.
 */
export function HarborMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="viora-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#viora-mark-fill)" />
      <path
        d="M19.5 21 L32 43.5 L44.5 21"
        stroke="var(--color-canvas, #0b0b0f)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
