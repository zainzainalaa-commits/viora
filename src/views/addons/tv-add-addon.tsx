import { useState } from "react";
import { Link as LinkIcon, User } from "lucide-react";
import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { TvSignIn } from "@/components/tv-sign-in";
import { TvTextEntry } from "@/components/tv-text-entry";

/**
 * Getting an addon onto a television.
 *
 * Browsing a catalogue of a thousand community addons is a pointer's task: you
 * read, compare, hover, read again. On a remote it is a thousand stops nobody
 * will ever walk, which is why that surface is gone from the TV and this took
 * its place. There are only two ways an addon realistically arrives here:
 *
 *   - the viewer already has addons, in a Stremio account, and wants them here
 *   - the viewer has a link, from a phone or a friend, and wants that one
 *
 * The account path never asks the television for a password. Stremio's own
 * pairing service issues a code, the phone approves it, and the auth key comes
 * back — the same handshake a set-top box uses everywhere else. Typing an email
 * and a password on the on-screen keyboard stays available for anyone who would
 * rather do that, because a pairing service that is down must not be the only
 * way in.
 */

type Step = { kind: "choose" } | { kind: "signin" };

export function TvAddAddon({
  onUrl,
  onClose,
}: {
  /** Hands a pasted manifest URL back to the screen, which owns the install sheet. */
  onUrl: (url: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { authKey } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [urlEntry, setUrlEntry] = useState(false);

  if (urlEntry) {
    return (
      <TvTextEntry
        title={t("Add addon from URL")}
        initial=""
        placeholder="https://…/manifest.json"
        onCommit={(v) => {
          if (v) onUrl(v);
        }}
        onClose={() => {
          setUrlEntry(false);
          onClose();
        }}
      />
    );
  }

  // The same sign-in the sidebar and everything else uses. Duplicating it here
  // would mean two pairing screens to keep in step, and they would not stay so.
  if (step.kind === "signin") return <TvSignIn onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/72 backdrop-blur-md">
      <FocusModal
        onClose={onClose}
        className="flex w-[min(92vw,640px)] flex-col gap-6 rounded-2xl border border-edge bg-elevated/97 p-8 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)]"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {t("Add an addon")}
          </span>
          <h2 className="text-[22px] font-semibold text-ink">{t("Two ways in")}</h2>
        </div>

        <div className="flex flex-col gap-3">
          <Choice
            icon={<User size={18} strokeWidth={2} />}
            title={authKey ? t("Signed in to Stremio") : t("Sign in to Stremio")}
            blurb={
              authKey
                ? t("Your account's addons are already available here.")
                : t("Your addons come with you — nothing to type on the television.")
            }
            disabled={!!authKey}
            primary
            onClick={() => setStep({ kind: "signin" })}
          />
          <Choice
            icon={<LinkIcon size={18} strokeWidth={2} />}
            title={t("Paste an addon link")}
            blurb={t("For a manifest URL you already have.")}
            onClick={() => setUrlEntry(true)}
          />
        </div>

        <div className="flex justify-end">
          <FocusButton
            onClick={onClose}
            className="flex h-11 items-center rounded-full bg-raised px-5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
          >
            {t("Close")}
          </FocusButton>
        </div>
      </FocusModal>
    </div>
  );
}

function Choice({
  icon,
  title,
  blurb,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <FocusButton
      onClick={onClick}
      disabled={disabled}
      // The account path is where focus lands: it is the one that brings a whole
      // library across, and the other needs a link the viewer may not have yet.
      data-focus-primary={primary ? "" : undefined}
      className="flex items-center gap-4 rounded-xl border border-edge-soft bg-canvas/40 px-5 py-4 text-start transition-colors hover:border-edge hover:bg-raised disabled:opacity-45"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        <span className="text-[12.5px] text-ink-muted">{blurb}</span>
      </span>
    </FocusButton>
  );
}
