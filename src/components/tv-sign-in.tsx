import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, LogIn, Mail, QrCode, RefreshCw, X } from "lucide-react";
import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { useAuth } from "@/lib/auth";
import { createLoginLink, readLoginLink, type LoginLink } from "@/lib/stremio-link";
import { useT } from "@/lib/i18n";
import { TvTextEntry } from "./tv-text-entry";

/**
 * Signing in to Stremio from the sofa.
 *
 * Two ways, because neither covers everyone: the phone pairing Stremio runs for
 * exactly this — a code on the screen, the typing done on a device with a
 * keyboard — and the plain email and password for anyone who would rather, or
 * for when the pairing service is unreachable.
 *
 * Rendered through a portal, and that is not decoration. This dialog is opened
 * from the profile chip, which lives inside the sidebar, and a `position: fixed`
 * element inside an ancestor with a transform or a backdrop filter is positioned
 * against that ancestor rather than the viewport — so the sheet appeared pinned
 * to the sidebar with half of it off the left edge of the screen. Mounting it on
 * `document.body` puts it back in the middle of the television.
 *
 * This is the only TV sign-in in the app on purpose: every entry point reaches
 * it through `AuthModal`, so there is one flow to get right rather than five
 * that drift apart.
 */
export function TvSignIn({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { signIn, signInWithKey } = useAuth();
  const [mode, setMode] = useState<"pair" | "credentials">("pair");
  const [error, setError] = useState<string | null>(null);

  const body = (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/72 p-6 backdrop-blur-md">
      <FocusModal
        onClose={onClose}
        className="flex max-h-[92vh] w-[min(92vw,660px)] flex-col gap-6 overflow-y-auto rounded-2xl border border-edge bg-elevated/97 p-8 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)]"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {t("Stremio")}
          </span>
          <h2 className="text-[22px] font-semibold text-ink">
            {mode === "pair" ? t("Sign in with your phone") : t("Sign in")}
          </h2>
        </div>

        {error && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12.5px] text-danger ring-1 ring-danger/30">
            {error}
          </p>
        )}

        {mode === "pair" ? (
          <PairPane
            onKey={async (key) => {
              try {
                await signInWithKey(key);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : t("Sign-in failed."));
              }
            }}
          />
        ) : (
          <CredentialsPane
            onSubmit={async (email, password) => {
              setError(null);
              try {
                await signIn(email, password);
                onClose();
                return true;
              } catch (e) {
                setError(e instanceof Error ? e.message : t("Sign-in failed."));
                return false;
              }
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <FocusButton
            onClick={() => {
              setError(null);
              setMode(mode === "pair" ? "credentials" : "pair");
            }}
            className="me-auto flex h-11 items-center gap-2 rounded-full border border-edge-soft px-5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
          >
            {mode === "pair" ? <KeyRound size={14} strokeWidth={2.2} /> : <QrCode size={14} strokeWidth={2.2} />}
            {mode === "pair" ? t("Use email and password instead") : t("Use my phone instead")}
          </FocusButton>
          <FocusButton
            onClick={onClose}
            className="flex h-11 items-center gap-2 rounded-full bg-raised px-5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
          >
            <X size={14} strokeWidth={2.4} />
            {t("Close")}
          </FocusButton>
        </div>
      </FocusModal>
    </div>
  );

  return createPortal(body, document.body);
}

/**
 * Both fields on screen at once.
 *
 * Asking for the email, taking it away, then asking for the password is a wizard
 * — the viewer cannot see what they already typed, cannot go back to fix a
 * mistyped address, and cannot tell how much is left. A form shows the state of
 * both, and each row opens the keyboard for its own value.
 */
function CredentialsPane({
  onSubmit,
}: {
  onSubmit: (email: string, password: string) => Promise<boolean>;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<"email" | "password" | null>(null);
  const [busy, setBusy] = useState(false);

  if (editing) {
    const forPassword = editing === "password";
    return (
      <TvTextEntry
        title={forPassword ? t("Stremio password") : t("Stremio email")}
        initial={forPassword ? password : email}
        placeholder={forPassword ? t("Your password") : "name@example.com"}
        onCommit={(v) => (forPassword ? setPassword(v) : setEmail(v))}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        icon={<Mail size={16} strokeWidth={2} />}
        label={t("Email")}
        value={email}
        placeholder="name@example.com"
        primary
        onClick={() => setEditing("email")}
      />
      <Field
        icon={<KeyRound size={16} strokeWidth={2} />}
        label={t("Password")}
        // Shown as dots for the same reason every sign-in does it: this one is
        // on a television, in a room with other people in it.
        value={password ? "•".repeat(Math.min(password.length, 24)) : ""}
        placeholder={t("Your password")}
        onClick={() => setEditing("password")}
      />
      <FocusButton
        onClick={async () => {
          if (!email || !password || busy) return;
          setBusy(true);
          const ok = await onSubmit(email, password);
          if (!ok) setBusy(false);
        }}
        disabled={!email || !password || busy}
        className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} strokeWidth={2.4} />}
        {t("Sign in")}
      </FocusButton>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  placeholder,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <FocusButton
      onClick={onClick}
      data-focus-primary={primary ? "" : undefined}
      className="flex h-14 items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 text-start transition-colors hover:border-edge hover:bg-raised"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
          {label}
        </span>
        <span dir="ltr" className={`truncate text-[15px] ${value ? "text-ink" : "text-ink-subtle"}`}>
          {value || placeholder}
        </span>
      </span>
    </FocusButton>
  );
}

function PairPane({ onKey }: { onKey: (authKey: string) => void }) {
  const t = useT();
  const [link, setLink] = useState<LoginLink | null>(null);
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const delivered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    let poll = 0;
    let stop = 0;
    setLink(null);
    setExpired(false);
    delivered.current = false;

    createLoginLink(ac.signal)
      .then((l) => {
        if (cancelled) return;
        setLink(l);
        // Polled, because the pairing service has no way to reach the
        // television: the viewer is watching this screen while they approve on
        // the phone, so the wait has to end by itself.
        poll = window.setInterval(async () => {
          if (delivered.current) return;
          const key = await readLoginLink(l.code, ac.signal).catch(() => null);
          if (key && !delivered.current) {
            delivered.current = true;
            window.clearInterval(poll);
            onKey(key);
          }
        }, 2000);
        stop = window.setTimeout(() => {
          window.clearInterval(poll);
          if (!delivered.current && !cancelled) setExpired(true);
        }, 3 * 60 * 1000);
      })
      .catch(() => {
        if (!cancelled) setExpired(true);
      });

    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [attempt, onKey]);

  return (
    <div className="flex items-center gap-6">
      <div className="flex h-[168px] w-[168px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
        {link ? (
          <img src={link.qrcode} alt="" className="h-full w-full object-contain" />
        ) : (
          <Loader2 size={26} className="animate-spin text-black/50" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[14px] leading-relaxed text-ink-muted">
          {t("Scan this with your phone, or open the address below and enter the code.")}
        </p>
        <p dir="ltr" className="text-[15px] font-semibold text-ink">
          link.stremio.com
        </p>
        <p dir="ltr" className="text-[34px] font-bold tracking-[0.3em] text-accent">
          {link?.code ?? "…"}
        </p>
        {expired ? (
          <FocusButton
            onClick={() => setAttempt((n) => n + 1)}
            data-focus-primary
            className="mt-1 flex h-10 w-fit items-center gap-2 rounded-full bg-ink px-4 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            <RefreshCw size={13} strokeWidth={2.4} />
            {t("New code")}
          </FocusButton>
        ) : (
          <p className="flex items-center gap-2 text-[12.5px] text-ink-subtle">
            <Loader2 size={12} className="animate-spin" />
            {t("Waiting for your phone…")}
          </p>
        )}
      </div>
    </div>
  );
}
