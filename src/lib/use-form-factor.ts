import { useSyncExternalStore } from "react";
import { formFactor, refreshFormFactor, type FormFactor } from "@/lib/platform";

/**
 * `formFactor()` memoises its answer, so a phone rotating into landscape (or a
 * foldable opening) would keep the old layout until something else re-rendered.
 * This recomputes on resize and pushes the new value into React.
 */

const listeners = new Set<() => void>();
let snapshot: FormFactor = formFactor();
let bound = false;
let timer = 0;

function recompute() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const next = refreshFormFactor();
    if (next === snapshot) return;
    snapshot = next;
    document.documentElement.dataset.formFactor = next;
    for (const listener of listeners) listener();
  }, 150);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!bound && typeof window !== "undefined") {
    bound = true;
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FormFactor {
  return snapshot;
}

export function useFormFactor(): FormFactor {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsPhone(): boolean {
  return useFormFactor() === "phone";
}

export function useIsTV(): boolean {
  return useFormFactor() === "tv";
}
