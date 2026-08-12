import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { Check } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import {
  closeLeaveConfirm,
  getLeaveConfirm,
  subscribeLeaveConfirm,
} from "@/lib/player/leave-confirm";

/**
 * The question asked on the way out of a film.
 *
 * Everything here is about the remote holding the dialog rather than the page
 * behind it, and three things were wrong before:
 *
 *  - Enter was caught globally and always meant "leave", so landing on "Keep
 *    watching" and pressing OK still ended the film. The keys now belong to
 *    whichever button is focused, which is the only reading a viewer can
 *    predict.
 *  - The destructive button took focus on open. The safe one does now: the
 *    dialog appears because someone may have pressed Back by accident.
 *  - "Don't ask me again" was a bare checkbox, reachable only by mouse. It is a
 *    focusable row, so the remote can actually set it.
 */
export function LeaveConfirmModal() {
  const t = useT();
  const state = useSyncExternalStore(subscribeLeaveConfirm, getLeaveConfirm);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (state.open) setRemember(false);
  }, [state.open]);

  // Escape only. Enter is deliberately absent: it belongs to the focused button.
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeLeaveConfirm();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.open]);

  if (!state.open) return null;

  const leave = () => {
    const fn = state.onConfirm;
    closeLeaveConfirm();
    fn?.(remember);
  };

  return (
    <FocusModal
      onClose={closeLeaveConfirm}
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-edge bg-surface p-7 text-center shadow-2xl">
        <h2 className="text-[22px] font-bold text-ink">{t("Leave the show?")}</h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
          {t("We'll save your spot so you can pick up right where you left off.")}
        </p>

        <FocusButton
          type="button"
          role="switch"
          aria-checked={remember}
          onClick={() => setRemember((v) => !v)}
          className="mt-5 inline-flex items-center justify-center gap-2.5 rounded-xl px-3 py-2 text-[14px] text-ink-muted transition-colors hover:bg-elevated"
        >
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 transition-colors ${
              remember ? "border-accent bg-accent text-canvas" : "border-edge"
            }`}
          >
            {remember && <Check size={12} strokeWidth={3} />}
          </span>
          {t("Don't ask me again")}
        </FocusButton>

        <div className="mt-6 flex gap-3">
          {/* The safe way out, and where focus lands. */}
          <FocusButton
            autoFocus
            onClick={closeLeaveConfirm}
            className="h-12 flex-1 rounded-xl bg-elevated text-[16px] font-semibold text-ink transition-colors hover:bg-raised"
          >
            {t("Keep watching")}
          </FocusButton>
          <FocusButton
            onClick={leave}
            className="h-12 flex-1 rounded-xl bg-ink text-[16px] font-semibold text-canvas transition-transform hover:scale-[1.02]"
          >
            {t("Leave")}
          </FocusButton>
        </div>
      </div>
    </FocusModal>
  );
}
