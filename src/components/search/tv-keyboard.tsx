import { useState } from "react";
import { Delete, Globe, Space } from "lucide-react";
import { FocusButton, FocusSection } from "@/lib/tv-focus";
import { useT } from "@/lib/i18n";

/**
 * The on-screen keyboard a remote can actually type on.
 *
 * A text field is a desktop control: it assumes something that produces
 * characters. A D-pad produces directions, so on a TV the field either sits
 * there uselessly or hands the arrows to Android's own keyboard, which covers
 * the screen and swallows the very keys navigation needs. Every TV app solves
 * this the same way — a grid of letters that are themselves focus targets — and
 * that is what this is.
 *
 * The grid is deliberately square-ish rather than a QWERTY layout. Alphabetical
 * order is what the viewer can predict from across the room, and a D-pad reaches
 * any key in at most a few presses either way, so the muscle memory a QWERTY
 * layout buys a typist is worth nothing here.
 */

const LATIN = [
  ["a", "b", "c", "d", "e", "f"],
  ["g", "h", "i", "j", "k", "l"],
  ["m", "n", "o", "p", "q", "r"],
  ["s", "t", "u", "v", "w", "x"],
  ["y", "z", "1", "2", "3", "4"],
  ["5", "6", "7", "8", "9", "0"],
];

// Arabic is laid out in alphabet order for the same reason as the Latin grid.
// The forms that differ only by hamza or ta marbuta are included as their own
// keys rather than hidden behind a modifier: a viewer searching a title should
// not have to know which form the catalogue stored.
const ARABIC = [
  ["ا", "ب", "ت", "ث", "ج", "ح"],
  ["خ", "د", "ذ", "ر", "ز", "س"],
  ["ش", "ص", "ض", "ط", "ظ", "ع"],
  ["غ", "ف", "ق", "ك", "ل", "م"],
  ["ن", "ه", "و", "ي", "ة", "ى"],
  ["أ", "إ", "آ", "ؤ", "ئ", "ء"],
];

export function TvKeyboard({
  onKey,
  onSpace,
  onBackspace,
  focusKey,
  primary = false,
}: {
  onKey: (char: string) => void;
  onSpace: () => void;
  onBackspace: () => void;
  /** Names the keyboard as a zone so the screen can open focus here. */
  focusKey?: string;
  /**
   * Marks the first letter as where focus enters the screen.
   *
   * A search screen that opens with the highlight on Back is a search screen
   * that costs a press before the first letter — and on the screen this is used
   * on, typing is the only reason to be here.
   */
  primary?: boolean;
}) {
  const t = useT();
  const [arabic, setArabic] = useState(false);
  const rows = arabic ? ARABIC : LATIN;

  const keyClass =
    "flex h-11 w-11 items-center justify-center rounded-md bg-elevated/70 text-[15px] font-medium text-ink " +
    "transition-colors hover:bg-elevated hover:text-ink";

  return (
    <FocusSection
      focusKey={focusKey}
      // Focus should enter the letters at the same place every time; where the
      // viewer left off is meaningless in a grid of characters.
      rememberChild={false}
      className="flex w-[268px] shrink-0 flex-col gap-2"
      aria-label={t("On-screen keyboard")}
    >
      <div className="flex gap-2">
        <FocusButton
          onClick={onSpace}
          aria-label={t("Space")}
          className="flex h-11 flex-1 items-center justify-center rounded-md bg-elevated/70 text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <Space size={18} strokeWidth={2} />
        </FocusButton>
        <FocusButton
          onClick={onBackspace}
          aria-label={t("Delete")}
          className="flex h-11 flex-1 items-center justify-center rounded-md bg-elevated/70 text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <Delete size={18} strokeWidth={2} />
        </FocusButton>
      </div>

      {rows.map((row, i) => (
        <div key={i} className="flex gap-2" dir="ltr">
          {row.map((char, j) => (
            <FocusButton
              key={char}
              onClick={() => onKey(char)}
              aria-label={char}
              data-focus-primary={primary && i === 0 && j === 0 ? "" : undefined}
              className={keyClass}
            >
              {char}
            </FocusButton>
          ))}
        </div>
      ))}

      <FocusButton
        onClick={() => setArabic((v) => !v)}
        aria-label={t("Switch keyboard language")}
        className="mt-1 flex h-11 items-center justify-center gap-2 rounded-md bg-elevated/70 text-[13px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        <Globe size={15} strokeWidth={2} />
        {arabic ? "ABC" : "أ ب ت"}
      </FocusButton>
    </FocusSection>
  );
}
