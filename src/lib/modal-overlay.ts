import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ModalPayload = {
  kind: string;
  state: unknown;
};

export async function modalOverlayOpen(kind: string, state: unknown): Promise<void> {
  await invoke("modal_overlay_open", { payload: { kind, state } });
}

export async function modalOverlayClose(): Promise<void> {
  await invoke("modal_overlay_close").catch(() => {});
}

export async function modalOverlayEmitState(kind: string, state: unknown): Promise<void> {
  await invoke("modal_overlay_emit_state", { payload: { kind, state } }).catch(() => {});
}

export async function modalOverlayEmitAction(event: string, payload: unknown): Promise<void> {
  await invoke("modal_overlay_emit_action", { event, payload }).catch(() => {});
}

export async function modalOverlaySync(): Promise<void> {
  await invoke("modal_overlay_sync").catch(() => {});
}

export async function modalOverlayGetPending(): Promise<ModalPayload | null> {
  try {
    return (await invoke<ModalPayload | null>("modal_overlay_get_pending")) ?? null;
  } catch {
    return null;
  }
}

export function onModalState(handler: (p: ModalPayload) => void): Promise<UnlistenFn> {
  return listen<ModalPayload>("modal://state", (e) => handler(e.payload));
}

export function onModalShow(handler: (p: ModalPayload) => void): Promise<UnlistenFn> {
  return listen<ModalPayload>("modal://show", (e) => handler(e.payload));
}

export function onModalClosedFromOverlay(handler: () => void): Promise<UnlistenFn> {
  return listen("modal://closed", () => handler());
}
