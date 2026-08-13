import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { SpatialNavigation } from "@noriginmedia/norigin-spatial-navigation";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string };

export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    // The engine keeps a cached box for every control, and a popover that has
    // just appeared has none — so the first press is resolved against the page
    // underneath. Measured on the metadata language list: the arrows walked the
    // settings nav behind the open dropdown, which is how a viewer aiming for
    // العربية came away with 中文 (简体), the row above it.
    const measure = window.setTimeout(() => SpatialNavigation.updateAllLayouts(), 60);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(measure);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <FocusButton
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-canvas/40 px-3.5 text-[13.5px] outline-none transition-colors ${
          open ? "border-accent" : "border-edge-soft hover:border-edge"
        }`}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-ink-subtle"}`}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-ink-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </FocusButton>
      {open && (
        <FocusModal
          onClose={() => setOpen(false)}
          // Spaced, and each option keeps its height.
          //
          // Options that touch give the spatial navigator nothing to aim
          // between, and in a scrolling column flex children are free to
          // squeeze — the fault that made every second country unreachable in
          // the region list. Here it is worse than unreachable: the metadata
          // language landed one row off, and a viewer who chose العربية ended
          // up with 中文 (简体), the entry directly above it.
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 flex max-h-[min(360px,60vh)] flex-col gap-1 overflow-y-auto rounded-xl border border-edge bg-elevated p-1 shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)] animate-popover-in"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <FocusButton
                data-focus-primary={active ? "" : undefined}
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                data-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
                className={`flex h-10 w-full shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-start text-[13.5px] transition-colors ${
                  active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={15} strokeWidth={2.4} className="shrink-0 text-accent" />}
              </FocusButton>
            );
          })}
        </FocusModal>
      )}
    </div>
  );
}
