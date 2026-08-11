import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { isDpadPrimary } from "@/lib/platform";
import { TvTextEntry } from "./tv-text-entry";
import { useT } from "@/lib/i18n";

/**
 * The controls a settings screen needs when the pointer is gone.
 *
 * Three widgets on that screen cannot be worked by a remote at all, and they are
 * not rare: sixteen range sliders, five native selects, and ten file pickers,
 * spread across the panels. A `range` is dragged; a native `<select>` opens the
 * platform's own popup, which on Android TV appears wherever it likes and takes
 * the keys with it; a file picker needs a file manager that a television does
 * not have.
 *
 * Each is replaced here rather than in eleven files, and each keeps the desktop
 * control exactly as it was.
 */

/**
 * A value the D-pad can change, as one stop rather than three.
 *
 * Left and right move it and are consumed, so the press does not also walk focus
 * out of the control. Up and down are left alone, which is how the viewer leaves.
 */
export function TvSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
  className,
  children,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** How the number reads on screen — percent, pixels, seconds. */
  format?: (value: number) => string;
  label?: string;
  className?: string;
  /** The desktop control, used unchanged where there is a pointer. */
  children: ReactNode;
}) {
  if (!isDpadPrimary()) return <>{children}</>;

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const nudge = (delta: number) => {
    const next = clamp(Number((value + delta * step).toFixed(6)));
    if (next !== value) onChange(next);
  };
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <FocusButton
      type="button"
      aria-label={label}
      onArrowPress={(direction) => {
        if (direction === "left") {
          nudge(-1);
          return false;
        }
        if (direction === "right") {
          nudge(1);
          return false;
        }
        return true;
      }}
      className={`flex h-12 w-full items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 transition-colors hover:border-edge ${className ?? ""}`}
    >
      <ChevronLeft size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
        <span
          className="absolute inset-y-0 start-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </span>
      <ChevronRight size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      <span dir="ltr" className="w-16 shrink-0 text-end text-[13.5px] font-semibold tabular-nums text-ink">
        {format ? format(value) : value}
      </span>
    </FocusButton>
  );
}

/**
 * A choice, as a dialog rather than the platform's own popup.
 *
 * A native `<select>` on Android TV hands the key events to a system window the
 * focus engine knows nothing about; what comes back is a remote that appears to
 * stop working. A list the app draws itself stays inside the app's own
 * navigation.
 */
export function TvSelect<T extends string>({
  value,
  options,
  onChange,
  title,
  className,
  children,
}: {
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  title: string;
  className?: string;
  /** The desktop `<select>`, untouched. */
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!isDpadPrimary()) return <>{children}</>;

  const current = options.find((o) => o.value === value);

  return (
    <>
      <FocusButton
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-12 items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 text-start text-[14px] text-ink transition-colors hover:border-edge ${className ?? ""}`}
      >
        <span className="truncate">{current?.label ?? String(value)}</span>
        <ChevronRight size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      </FocusButton>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/72 p-6 backdrop-blur-md">
            <FocusModal
              onClose={() => setOpen(false)}
              className="flex max-h-[86vh] w-[min(92vw,520px)] flex-col gap-4 overflow-y-auto rounded-2xl border border-edge bg-elevated/97 p-7 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)]"
            >
              <h2 className="text-[19px] font-semibold text-ink">{title}</h2>
              <div className="flex flex-col gap-2">
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <FocusButton
                      key={o.value}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      data-focus-primary={active ? "" : undefined}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
                        active
                          ? "border-ink bg-ink/10 text-ink"
                          : "border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14.5px] font-medium">{o.label}</span>
                        {o.hint && <span className="text-[12px] text-ink-subtle">{o.hint}</span>}
                      </span>
                      {active && <Check size={15} strokeWidth={2.6} className="shrink-0" />}
                    </FocusButton>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <FocusButton
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center gap-2 rounded-full bg-raised px-5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
                >
                  <X size={14} strokeWidth={2.4} />
                  {t("Close")}
                </FocusButton>
              </div>
            </FocusModal>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * A text field the remote can fill.
 *
 * The same shape as the sliders and the selects here: the desktop control is
 * passed through untouched, and on a television it becomes one stop that opens
 * the on-screen keyboard — where Paste is what actually gets a webhook URL or a
 * server address in without spelling it out letter by letter.
 */
export function TvField({
  value,
  onCommit,
  title,
  placeholder,
  className,
  children,
}: {
  value: string;
  onCommit: (value: string) => void;
  title: string;
  placeholder?: string;
  className?: string;
  /** The desktop `<input>`, unchanged. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!isDpadPrimary()) return <>{children}</>;
  return (
    <>
      <FocusButton
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-12 w-full items-center rounded-xl border border-edge-soft bg-canvas/40 px-4 text-start text-[14px] transition-colors hover:border-edge ${className ?? ""}`}
      >
        <span dir="ltr" className={`truncate ${value ? "text-ink" : "text-ink-subtle"}`}>
          {value || placeholder || title}
        </span>
      </FocusButton>
      {open && (
        <TvTextEntry
          title={title}
          initial={value}
          placeholder={placeholder}
          onCommit={onCommit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Something that only a pointer can do — picking a file, cropping an image.
 *
 * Hidden rather than shown broken: a television has no file manager to open, so
 * the control is a dead end that costs a stop on the way past it. The setting
 * itself is untouched and still applies if it was set on the desktop.
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  if (isDpadPrimary()) return null;
  return <>{children}</>;
}
