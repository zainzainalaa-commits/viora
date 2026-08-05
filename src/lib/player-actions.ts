import { useSyncExternalStore } from "react";

export type PlayerActions = {
  download: () => void;
  toggleFullscreen: () => void;
  canDownload: boolean;
  downloadSubtitle: () => void;
  canDownloadSubtitle: boolean;
};

let current: PlayerActions | null = null;
const listeners = new Set<() => void>();

export function setPlayerActions(actions: PlayerActions | null) {
  if (current === actions) return;
  if (
    current &&
    actions &&
    current.download === actions.download &&
    current.toggleFullscreen === actions.toggleFullscreen &&
    current.canDownload === actions.canDownload &&
    current.downloadSubtitle === actions.downloadSubtitle &&
    current.canDownloadSubtitle === actions.canDownloadSubtitle
  ) {
    return;
  }
  current = actions;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePlayerActions(): PlayerActions | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
