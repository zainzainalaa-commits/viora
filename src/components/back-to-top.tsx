import { FocusButton } from "@/lib/tv-focus";
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isDpadPrimary } from "@/lib/platform";

export function BackToTop({
  scrollRef,
  threshold = 600,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  threshold?: number;
}) {
  const t = useT();
  const [show, setShow] = useState(false);

  // A shortcut for a scrollbar the remote does not have — and worse, a focus
  // stop that appears and disappears with scroll position. Focus can be resting
  // on it at the moment it unmounts, which loses focus entirely. On a D-pad the
  // page already comes to the focused item, so the button has nothing to add.
  const hidden = isDpadPrimary();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > threshold);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, threshold]);

  if (hidden) return null;

  return (
    <FocusButton
      onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("Back to top")}
      className={`fixed bottom-5 end-5 z-40 flex h-8 w-8 items-center justify-center rounded-md border border-edge-soft/40 bg-canvas/90 text-ink-muted transition-[transform,opacity,background-color,color] duration-300 hover:bg-canvas hover:text-ink ${
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp size={14} strokeWidth={2.2} />
    </FocusButton>
  );
}
