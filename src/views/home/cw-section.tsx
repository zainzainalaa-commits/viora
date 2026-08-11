import { FocusButton } from "@/lib/tv-focus";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
import { ContinueCard } from "@/components/continue-card";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { type LibraryItem } from "@/lib/stremio";
import { isLibraryItemWatched } from "@/lib/trakt/library-key";

type Props = {
  signedIn: boolean;
  items: LibraryItem[];
  watchedSet?: Set<string>;
  onDismiss: (item: LibraryItem) => void;
};

export function CWSection({ signedIn, items, watchedSet, onDismiss }: Props) {
  const t = useT();
  const [showAuth, setShowAuth] = useState(false);

  const signInButton = signedIn ? null : (
    <FocusButton
      type="button"
      onClick={() => setShowAuth(true)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-edge-soft px-3 py-1 text-[12.5px] font-medium text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
    >
      <LogIn size={13} strokeWidth={2.2} />
      {t("profile.signIn")}
    </FocusButton>
  );

  const authModal = showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null;

  if (items.length > 0) {
    return (
      <>
        <Row
          title={t("Continue Watching")}
          min={260}
          shape="landscape"
          scrollKey="home:cw"
          headerRight={signInButton}
        >
          {items.map((item) => (
            <ContinueCard
              key={item._id}
              item={item}
              watched={watchedSet ? isLibraryItemWatched(item, watchedSet) : false}
              onDismiss={onDismiss}
            />
          ))}
        </Row>
        {authModal}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[17px] font-medium tracking-tight text-ink">{t("Continue Watching")}</h3>
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-edge px-6 py-14 text-center">
        {/*
          One neutral line either way.

          The signed-out state used to invite the viewer to sign in to Stremio
          right here, which duplicated Settings -> Stremio account and put a
          control between the hero and the first row that a remote had to step
          over on every trip down the page and back up.
        */}
        <p className="text-[15.5px] leading-relaxed text-ink-muted">
          {signedIn
            ? t("Nothing in progress yet. Press Play on something.")
            : t("Nothing in progress yet. Sign in from Settings to bring in your library.")}
        </p>
      </div>
      {authModal}
    </div>
  );
}
