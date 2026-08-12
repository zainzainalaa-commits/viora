import { FocusButton, FocusModal } from "@/lib/tv-focus";
import { Lock, LogIn, LogOut, Pencil, Plus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthModal } from "@/components/auth-modal";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { isDpadPrimary } from "@/lib/platform";
import { verifyProfilePassword } from "@/lib/profile-password";
import { useProfiles, type Profile } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import type { User } from "@/lib/stremio";
import { openUrl } from "@/lib/window";

const STREMIO_REGISTER_URL = "https://www.stremio.com/register";

export function ProfileChip({ collapsed = false }: { collapsed?: boolean } = {}) {
  const { user, signOut } = useAuth();
  const { settings } = useSettings();
  const { profiles, activeProfile, openPicker, selectProfile } = useProfiles();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  /** Signing out is one press from the chip on a TV, so it asks first. */
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<Profile | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const doSwitch = (p: Profile) => {
    if (p.passwordHash) openPicker({ kind: "unlock", profileId: p.id });
    else selectProfile(p.id);
  };
  const requestSwitch = (p: Profile) => {
    setMenuOpen(false);
    if (activeProfile?.kid?.parentPinHash) {
      setPendingSwitch(p);
      return;
    }
    doSwitch(p);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const otherProfiles = profiles.filter((p) => p.id !== activeProfile?.id);
  const kid = !!activeProfile?.kid;
  const harborAvatar = settings.harborAvatar?.startsWith("/kids/avatars/")
    ? null
    : settings.harborAvatar;

  /*
    On a television the chip is the action, not a menu.

    The menu is drawn above the chip, inside the sidebar's scrolling column, so
    pressing up from the chip reaches the sidebar entry above it and never the
    popup — it is unreachable by remote, which makes signing in unreachable too.
    A dialog does not have that problem, so the chip opens one directly: sign in
    when signed out, sign out when signed in.
  */
  const tv = isDpadPrimary();

  return (
    <div ref={ref} className="relative">
      <FocusButton
        onClick={() => {
          if (!tv) {
            setMenuOpen((o) => !o);
            return;
          }
          if (user) setSignOutOpen(true);
          else setAuthOpen(true);
        }}
        aria-label={activeProfile?.name ?? user?.email ?? t("profile.fallback")}
        className={`flex w-full items-center justify-center gap-3.5 rounded-xl py-2.5 text-start transition-colors hover:bg-elevated/60 ${
          collapsed ? "" : "lg:justify-start lg:px-3"
        }`}
      >
        <ProfileAvatar profile={activeProfile} user={user} fallbackAvatar={harborAvatar} preferUser={tv && !!user} />
        <div className={`hidden min-w-0 flex-1 ${collapsed ? "" : "lg:block"}`}>
          <div className="truncate text-[14.5px] font-medium tracking-tight text-ink">
            {/*
              Signed in means signed in, and the name shown is the account's.

              A local profile normally wins here, and on a desktop that is right:
              profiles are a thing you make and name. On a television they are
              not — the editor for them is gone, so the profile is an
              unconfigurable leftover called "Guest 4471", and it was sitting on
              top of the Stremio account the viewer had just signed into. There
              was no way to correct it from the sofa, because correcting it is
              exactly the screen that does not exist here.
            */}
            {tv && user
              ? (user.fullname || user.email?.split("@")[0] || t("profile.fallback"))
              : (activeProfile?.name ?? user?.fullname ?? user?.email?.split("@")[0] ?? t("profile.fallback"))}
          </div>
          <div className="truncate text-[12px] text-ink-subtle">
            <SubtitleText active={activeProfile} profiles={profiles} user={user} />
          </div>
        </div>
      </FocusButton>

      {menuOpen && !tv && (
        <div
          className={`absolute bottom-full mb-1.5 overflow-hidden rounded-xl border border-edge bg-elevated shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)] ${
            collapsed ? "start-0 w-64" : "start-2 end-2 lg:start-4 lg:end-4"
          }`}
        >
          {otherProfiles.length > 0 && (
            <div className="flex flex-col gap-0.5 border-b border-edge-soft p-1.5">
              <span className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                {t("profile.switch")}
              </span>
              {otherProfiles.map((p) => (
                <FocusButton
                  key={p.id}
                  onClick={() => requestSwitch(p)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-raised"
                >
                  <span className="relative inline-flex shrink-0">
                    <ProfileAvatar profile={p} user={null} fallbackAvatar={null} compact />
                    {p.passwordHash && (
                      <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink shadow-sm ring-1 ring-edge">
                        <Lock size={8} strokeWidth={2.6} />
                      </span>
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                    {p.isPrimary && (
                      <span
                        className="text-[9px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: p.color }}
                      >
                        {t("profile.primary")}
                      </span>
                    )}
                  </div>
                </FocusButton>
              ))}
            </div>
          )}
          {!kid && (
          <div className="flex flex-col">
            {/*
              Profile management is not a television feature.

              Naming a profile, picking its colour and editing its avatar are
              forms — text fields and pickers built for a pointer — and they sit
              in the one menu a remote reaches constantly on its way to signing
              in. On a TV the menu is the account and nothing else; the profile
              screens stay exactly as they are on the desktop.
            */}
            {!isDpadPrimary() && (
              <>
                <FocusButton
                  onClick={() => {
                    openPicker({ kind: "list" });
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 px-4 py-3 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  <Users size={14} strokeWidth={2.2} />
                  {t("profile.whoWatching")}
                </FocusButton>
                {activeProfile && (
                  <FocusButton
                    onClick={() => {
                      openPicker({ kind: "edit", profileId: activeProfile.id });
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                  >
                    <Pencil size={14} strokeWidth={2.2} />
                    {t("profile.editThis")}
                  </FocusButton>
                )}
                {activeProfile?.isPrimary && (
                  <FocusButton
                    onClick={() => {
                      openPicker({ kind: "create" });
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                  >
                    <Plus size={14} strokeWidth={2.2} />
                    {t("profile.new")}
                  </FocusButton>
                )}
              </>
            )}
            {user ? (
              <FocusButton
                onClick={() => {
                  signOut();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 border-t border-edge-soft px-4 py-3 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogOut size={14} strokeWidth={2.2} />
                {t("profile.signOut")}
              </FocusButton>
            ) : (
              <FocusButton
                onClick={() => {
                  setAuthOpen(true);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 border-t border-edge-soft px-4 py-3 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogIn size={14} strokeWidth={2.2} />
                {t("profile.signIn")}
              </FocusButton>
            )}
          </div>
          )}
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {/* Portalled: a `fixed` sheet rendered inside the sidebar is positioned
          against the sidebar, not the screen, and lands half off the edge. */}
      {signOutOpen && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/72 backdrop-blur-md">
          <FocusModal
            onClose={() => setSignOutOpen(false)}
            className="flex w-[min(92vw,460px)] flex-col gap-5 rounded-2xl border border-edge bg-elevated/97 p-7 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)]"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-[19px] font-semibold text-ink">{t("profile.signOut")}</h2>
              <p className="text-[13px] text-ink-muted">{user?.email}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <FocusButton
                onClick={() => setSignOutOpen(false)}
                data-focus-primary
                className="flex h-11 items-center rounded-full bg-raised px-5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
              >
                {t("Cancel")}
              </FocusButton>
              <FocusButton
                onClick={() => {
                  signOut();
                  setSignOutOpen(false);
                }}
                className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
              >
                <LogOut size={14} strokeWidth={2.2} />
                {t("profile.signOut")}
              </FocusButton>
            </div>
          </FocusModal>
        </div>,
        document.body,
      )}
      {pendingSwitch && activeProfile?.kid?.parentPinHash && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const target = pendingSwitch;
              setPendingSwitch(null);
              selectProfile(target.id);
            },
            onCancel: () => setPendingSwitch(null),
          }}
          verify={(pin) => verifyProfilePassword(pin, activeProfile.kid!.parentPinHash!)}
          kids
        />
      )}
    </div>
  );
}

function ProfileAvatar({
  profile,
  user,
  fallbackAvatar,
  compact,
  preferUser,
}: {
  profile: Profile | null;
  user: User | null;
  fallbackAvatar: string | null;
  compact?: boolean;
  /** Show the signed-in account's picture ahead of the local profile's. */
  preferUser?: boolean;
}) {
  const dim = compact ? "h-9 w-9" : "h-12 w-12";
  const src = preferUser
    ? (user?.avatar ?? profile?.avatar ?? fallbackAvatar ?? null)
    : (profile?.avatar ?? fallbackAvatar ?? user?.avatar ?? null);
  const ringStyle = profile?.color ? { boxShadow: `0 0 0 2px ${profile.color}` } : undefined;
  return (
    <div
      className={`${dim} shrink-0 overflow-hidden rounded-full bg-elevated`}
      style={ringStyle}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <CatAvatar className="h-full w-full" />
      )}
    </div>
  );
}

function SubtitleText({
  active,
  profiles,
  user,
}: {
  active: Profile | null;
  profiles: Profile[];
  user: User | null;
}) {
  const t = useT();
  if (active?.shareStremioWith) {
    const src = profiles.find((p) => p.id === active.shareStremioWith);
    if (src) return <>{t("Sharing {name}'s Stremio", { name: src.name })}</>;
  }
  if (user) {
    return <>{t("profile.signedIn")}</>;
  }
  return (
    <>
      {t("Sign in to")}{" "}
      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          openUrl(STREMIO_REGISTER_URL);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openUrl(STREMIO_REGISTER_URL);
          }
        }}
        className="cursor-pointer text-ink transition-colors hover:text-accent"
      >
        Stremio
      </span>
    </>
  );
}
