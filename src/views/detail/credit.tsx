import { FocusButton } from "@/lib/tv-focus";
import type { PersonRef } from "@/lib/providers/tmdb";
import { useView } from "@/lib/view";
import { isDpadPrimary } from "@/lib/platform";

export function Credit({ label, people }: { label: string; people: PersonRef[] }) {
  const { openPerson } = useView();
  // A line of credits is prose, not a menu.
  //
  // Every resolved name is a link, which a mouse can ignore and a remote
  // cannot: walking off a poster into "Nina Krstic, Ezra Edelman, Libby Geist,
  // Deirdre Fenton, Connor Schell, John Dahl" means six presses through a
  // sentence to get anywhere. The names stay clickable where there is a
  // pointer; on a television they are text.
  const dpad = isDpadPrimary();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-subtle">
        {label}
      </span>
      <span className="text-[15px] leading-snug text-ink">
        {people.map((p, i) => {
          const resolved = p.id > 0 && !dpad;
          return (
            <span key={`${p.id}-${i}`}>
              {resolved ? (
                <FocusButton
                  data-person-card
                  onClick={() => openPerson(p.id)}
                  className="cursor-pointer rounded text-ink underline-offset-4 transition-colors hover:text-accent hover:underline"
                >
                  {p.name}
                </FocusButton>
              ) : (
                <span className="text-ink">{p.name}</span>
              )}
              {i < people.length - 1 && ", "}
            </span>
          );
        })}
      </span>
    </div>
  );
}
