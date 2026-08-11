import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardPaste, Eraser, X } from "lucide-react";
import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { TvKeyboard } from "@/components/search/tv-keyboard";
import { canPaste, readClipboard } from "@/lib/clipboard";
import { useT } from "@/lib/i18n";

/**
 * Typing on the Addons screen, with a remote.
 *
 * The screen carries two text fields — the addon search and the add-by-URL bar —
 * and a D-pad cannot put a character in either. It produces directions; a text
 * field expects characters. So on a TV those fields are not fields at all: they
 * are buttons that open this, the same alphabetical grid the search screen
 * types on, so there is one way to type in the app rather than two.
 *
 * The value is committed on Done rather than on every key. Searching the
 * catalogue on each letter would fire a request per press, and the viewer is
 * looking at the keyboard while they type, not at the results behind it.
 */
export function TvTextEntry({
  title,
  initial,
  placeholder,
  onCommit,
  onClose,
}: {
  title: string;
  initial: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);

  const commit = () => {
    onCommit(value.trim());
    onClose();
  };

  // Through a portal for the same reason the sign-in sheet is: opened from the
  // sidebar, a `fixed` element inside an ancestor that has a transform or a
  // backdrop filter is laid out against that ancestor, and the sheet ends up
  // half off the edge of the screen instead of centred on it.
  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/72 p-6 backdrop-blur-md">
      <FocusModal
        onClose={onClose}
        className="flex max-h-[92vh] w-[min(92vw,620px)] flex-col gap-5 overflow-y-auto rounded-2xl border border-edge bg-elevated/97 p-7 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)]"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {title}
          </span>
          <p
            dir="auto"
            className="min-h-[34px] break-all border-b border-edge-soft pb-2 text-[19px] text-ink"
          >
            {value || <span className="text-ink-subtle">{placeholder ?? ""}</span>}
          </p>
        </div>

        <div className="flex justify-center">
          <TvKeyboard
            // Focus enters on Paste when there is one — two controls claiming to
            // be the entry point means the first in the markup wins, and it is
            // not the one the viewer wants.
            primary={!canPaste()}
            onKey={(ch) => setValue((v) => v + ch)}
            onSpace={() => setValue((v) => v + " ")}
            onBackspace={() => setValue((v) => v.slice(0, -1))}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {canPaste() && (
            /*
              The realistic way a manifest URL arrives.

              A hundred characters of base64 is not something anyone types on a
              grid of letters, so the keyboard is the fallback and this is the
              path: copy the link anywhere on the device — the built-in browser,
              a message — and it lands here in one press.
            */
            <FocusButton
              onClick={async () => {
                const text = (await readClipboard()).trim();
                if (text) setValue(text);
              }}
              data-focus-primary
              className="me-auto flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
            >
              <ClipboardPaste size={14} strokeWidth={2.4} />
              {t("Paste")}
            </FocusButton>
          )}
          <FocusButton
            onClick={onClose}
            className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
          >
            <X size={14} strokeWidth={2.4} />
            {t("Cancel")}
          </FocusButton>
          <FocusButton
            onClick={() => setValue("")}
            disabled={!value}
            className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink disabled:opacity-40"
          >
            <Eraser size={14} strokeWidth={2.4} />
            {t("Clear")}
          </FocusButton>
          <FocusButton
            onClick={commit}
            className="flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            <Check size={14} strokeWidth={2.6} />
            {t("Done")}
          </FocusButton>
        </div>
      </FocusModal>
    </div>,
    document.body,
  );
}
