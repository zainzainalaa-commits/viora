import { useEffect, useRef, useState, type ReactNode } from "react";

export function LazyMount({
  children,
  fallback,
  rootMargin = "600px",
  minHeight = 240,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    const safety = window.setTimeout(() => setShown(true), 800);
    return () => {
      io.disconnect();
      window.clearTimeout(safety);
    };
  }, [shown, rootMargin]);

  if (shown) return <>{children}</>;
  return (
    <div ref={ref} style={{ minHeight }} aria-hidden>
      {fallback}
    </div>
  );
}
