import { useSyncExternalStore } from "react";

// ─── Automatic sync against another subtitle ──────────────────────────────────
//
// Published here rather than passed down: the status is produced beside the
// player and read inside the subtitle menu, four components away through two
// separate transports. This is the same store the manual bar above uses, which
// keeps both halves of the same feature in one place.

export type AutoSyncStatus = "idle" | "analyzing" | "synced" | "declined" | "unavailable";

export type AutoSyncState = {
  status: AutoSyncStatus;
  /** The track the answer belongs to, so a row can show its own result. */
  trackId: string | null;
  /** Which track was used as the clock. */
  referenceLabel: string | null;
  /** The correction at the middle of the runtime, in seconds. */
  offsetSec: number;
  /** True when the correction changes over the runtime, not just shifts it. */
  driftCorrected: boolean;
  confidence: number;
  anchors: number;
  reason?: string;
};

export const AUTO_SYNC_IDLE: AutoSyncState = {
  status: "idle",
  trackId: null,
  referenceLabel: null,
  offsetSec: 0,
  driftCorrected: false,
  confidence: 0,
  anchors: 0,
};

let autoSync: AutoSyncState = AUTO_SYNC_IDLE;
const autoListeners = new Set<() => void>();

export function setAutoSyncState(next: AutoSyncState): void {
  autoSync = next;
  autoListeners.forEach((l) => l());
}

export function autoSyncState(): AutoSyncState {
  return autoSync;
}

// ─── Asking for it ────────────────────────────────────────────────────────────
//
// Timing is checked when the viewer asks and not before. It costs a download
// and a few hundred milliseconds of alignment, and a subtitle that is already
// right — most of them — gains nothing from being measured. So the wand in the
// subtitle menu is a button that does something, not a switch that arms it.

let requests = 0;
const requestListeners = new Set<() => void>();

export function requestAutoSync(): void {
  requests += 1;
  requestListeners.forEach((l) => l());
}

export function useAutoSyncRequests(): number {
  return useSyncExternalStore(
    (cb) => {
      requestListeners.add(cb);
      return () => requestListeners.delete(cb);
    },
    () => requests,
    () => 0,
  );
}

export function useAutoSyncState(): AutoSyncState {
  return useSyncExternalStore(
    (cb) => {
      autoListeners.add(cb);
      return () => autoListeners.delete(cb);
    },
    () => autoSync,
    () => AUTO_SYNC_IDLE,
  );
}
