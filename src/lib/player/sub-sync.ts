import { useSyncExternalStore } from "react";

// ─── Store ────────────────────────────────────────────────────────────────────

let barOpen = false;
const listeners = new Set<() => void>();

export function openSyncBar(): void {
  if (barOpen) return;
  barOpen = true;
  listeners.forEach((l) => l());
}

export function closeSyncBar(): void {
  if (!barOpen) return;
  barOpen = false;
  listeners.forEach((l) => l());
}

export function toggleSyncBar(): void {
  if (barOpen) closeSyncBar();
  else openSyncBar();
}

export function useSyncBarOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => barOpen,
    () => false,
  );
}
