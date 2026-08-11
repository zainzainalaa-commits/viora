import { pulseWebviewMemoryLow } from "./webview-memory";

declare global {
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }
}

type Evictor = (aggressive: boolean) => void;

const evictors = new Map<string, Evictor>();

export function registerEvictable(name: string, evict: Evictor): void {
  evictors.set(name, evict);
}

export function runMaintenance(aggressive = false): void {
  for (const evict of evictors.values()) {
    try {
      evict(aggressive);
    } catch {}
  }
  void gcNativeSessions();
}

async function gcNativeSessions(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("proxy_gc_idle");
  } catch {}
}

export function purgeNow(): void {
  runMaintenance(true);
}

const INTERVAL_MS = 5 * 60 * 1000;
const HIDDEN_GRACE_MS = 30 * 1000;
const AGGRESSIVE_HEAP_DELTA_MB = 350;

const PRESSURE_POLL_MS = 8 * 1000;
const PRESSURE_HIGH_MB = 460;
const PRESSURE_LOW_MB = 330;

type PressureListener = (high: boolean) => void;
const pressureListeners = new Set<PressureListener>();
let pressureHigh = false;

function readHeapMB(): number | null {
  const mem = performance.memory;
  return mem ? mem.usedJSHeapSize / (1024 * 1024) : null;
}

function setPressure(high: boolean): void {
  if (high === pressureHigh) return;
  pressureHigh = high;
  for (const cb of pressureListeners) {
    try {
      cb(high);
    } catch {}
  }
  if (high) {
    runMaintenance(true);
    pulseWebviewMemoryLow();
  }
}

function pollPressure(): void {
  const mb = readHeapMB();
  if (mb == null) return;
  if (!pressureHigh && mb > PRESSURE_HIGH_MB) setPressure(true);
  else if (pressureHigh && mb < PRESSURE_LOW_MB) setPressure(false);
}

export function subscribeMemoryPressure(cb: PressureListener): () => void {
  pressureListeners.add(cb);
  cb(pressureHigh);
  return () => {
    pressureListeners.delete(cb);
  };
}

export function isMemoryPressureHigh(): boolean {
  return pressureHigh;
}

let started = false;

export function startMaintenance(): () => void {
  if (started) return () => {};
  started = true;

  const baselineMB = readHeapMB();
  const heapDelta = (): number => {
    const now = readHeapMB();
    return now != null && baselineMB != null ? now - baselineMB : 0;
  };

  const interval = window.setInterval(() => {
    runMaintenance(heapDelta() > AGGRESSIVE_HEAP_DELTA_MB);
  }, INTERVAL_MS);

  const pressureInterval = window.setInterval(pollPressure, PRESSURE_POLL_MS);

  let hiddenTimer: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenTimer = window.setTimeout(() => runMaintenance(true), HIDDEN_GRACE_MS);
    } else if (hiddenTimer != null) {
      window.clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    started = false;
    window.clearInterval(interval);
    window.clearInterval(pressureInterval);
    if (hiddenTimer != null) window.clearTimeout(hiddenTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
