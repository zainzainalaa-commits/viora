import { FocusButton } from "@/lib/tv-focus";
import { ArrowDown, ArrowUp, Eye, EyeOff, Hash, RotateCcw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHomeRowCatalog, type HomeRowEntry } from "@/lib/home-row-catalog";
import {
  effectiveOrder,
  isRowHidden,
  moveRow,
  renameRow,
  resetHomeRows,
  toggleHeroSource,
  toggleRowHidden,
  toggleRowNumerals,
} from "@/lib/home-customization";

/**
 * Editing Home's rows from Settings, which is the only place it lives now.
 *
 * This used to be an edit *mode* on Home itself: a button that turned the page
 * into a form, with controls layered over the content. That is a desktop idea —
 * it needs a pointer to be discoverable, and on a remote it put two extra stops
 * in the way of everyone who never wanted to reorder anything. The same
 * operations belong in Settings next to the rest of the Home layout options.
 *
 * The customization already lived in `settings.homeRows`, so nothing about the
 * data model changes; only where it is edited. The row *list* comes from a
 * catalog Home publishes, because Home is the only place that can assemble it.
 */
export function HomeRowsEditor() {
  const t = useT();
  const { settings, update } = useSettings();
  const catalog = useHomeRowCatalog();
  const custom = settings.homeRows;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const mutate = (next: typeof custom) => update({ homeRows: next });

  // `effectiveOrder` wants rows with a key; the catalog entries carry one, and
  // ordering never looks at anything else.
  const ordered = effectiveOrder(catalog as unknown as Parameters<typeof effectiveOrder>[0], custom);
  const byKey = new Map(catalog.map((r) => [r.key, r]));
  const rows = ordered.map((k) => byKey.get(k)).filter((r): r is HomeRowEntry => !!r);

  const hasChanges =
    custom.order.length > 0 ||
    custom.hidden.length > 0 ||
    Object.keys(custom.renamed).length > 0 ||
    (custom.numerals ?? []).length > 0 ||
    custom.heroSource !== null;

  if (rows.length === 0) {
    return (
      <p className="px-1 py-3 text-[12.5px] text-ink-subtle">
        {t("Open Home once and its rows will appear here to arrange.")}
      </p>
    );
  }

  const commitRename = (key: string) => {
    mutate(renameRow(custom, key, draft));
    setEditingKey(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const hidden = isRowHidden(custom, row.key);
        const numbered = (custom.numerals ?? []).includes(row.key);
        const isHero = custom.heroSource === row.key;
        const renamedTo = custom.renamed[row.key];
        return (
          <div
            key={row.key}
            className={`flex items-center gap-2 rounded-lg border border-edge-soft/40 px-3 py-2 ${
              hidden ? "opacity-55" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              {editingKey === row.key ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(row.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(row.key);
                    if (e.key === "Escape") setEditingKey(null);
                  }}
                  placeholder={row.name}
                  className="w-full rounded-md border border-edge-soft/55 bg-canvas px-2 py-1 text-[13px] text-ink focus:outline-none"
                />
              ) : (
                <span dir="auto" className="truncate text-[13px] font-medium text-ink">
                  {renamedTo ?? row.name}
                </span>
              )}
              <span className="text-[11px] text-ink-subtle">
                {renamedTo ? t("Renamed from {name}", { name: row.name }) : t(row.type === "series" ? "Series" : "Movies")}
              </span>
            </div>

            <FocusButton
              onClick={() => mutate(moveRow(custom, catalog as unknown as Parameters<typeof moveRow>[1], row.key, -1))}
              disabled={i === 0}
              aria-label={t("Move up")}
              title={t("Move up")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:opacity-30"
            >
              <ArrowUp size={14} strokeWidth={2.2} />
            </FocusButton>
            <FocusButton
              onClick={() => mutate(moveRow(custom, catalog as unknown as Parameters<typeof moveRow>[1], row.key, 1))}
              disabled={i === rows.length - 1}
              aria-label={t("Move down")}
              title={t("Move down")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:opacity-30"
            >
              <ArrowDown size={14} strokeWidth={2.2} />
            </FocusButton>
            <FocusButton
              onClick={() => {
                setDraft(renamedTo ?? "");
                setEditingKey(editingKey === row.key ? null : row.key);
              }}
              aria-label={t("Rename row")}
              title={t("Rename row")}
              className="flex h-8 items-center rounded-md px-2 text-[12px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              {t("Rename")}
            </FocusButton>
            <FocusButton
              onClick={() => mutate(toggleRowNumerals(custom, row.key))}
              aria-label={numbered ? t("Hide rank numbers") : t("Show rank numbers")}
              title={numbered ? t("Hide rank numbers") : t("Show rank numbers")}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                numbered ? "bg-ink text-canvas" : "text-ink-muted hover:bg-elevated hover:text-ink"
              }`}
            >
              <Hash size={14} strokeWidth={2.2} />
            </FocusButton>
            <FocusButton
              onClick={() => mutate(toggleHeroSource(custom, row.key))}
              aria-label={isHero ? t("Stop using for the hero") : t("Use for the hero")}
              title={isHero ? t("Stop using for the hero") : t("Use for the hero")}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                isHero ? "bg-accent text-canvas" : "text-ink-muted hover:bg-elevated hover:text-ink"
              }`}
            >
              <Star size={14} strokeWidth={2.2} className={isHero ? "fill-current" : ""} />
            </FocusButton>
            <FocusButton
              onClick={() => mutate(toggleRowHidden(custom, row.key))}
              aria-label={hidden ? t("Show row") : t("Hide row")}
              title={hidden ? t("Show row") : t("Hide row")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              {hidden ? <EyeOff size={14} strokeWidth={2.2} /> : <Eye size={14} strokeWidth={2.2} />}
            </FocusButton>
          </div>
        );
      })}

      {(custom.customSources ?? []).length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">
            {t("Custom sources")}
          </p>
          {custom.customSources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-2 rounded-lg border border-edge-soft/40 px-3 py-2"
            >
              <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {source.title}
              </span>
              <FocusButton
                onClick={() =>
                  mutate({
                    ...custom,
                    customSources: custom.customSources.filter((s) => s.id !== source.id),
                  })
                }
                aria-label={t("Remove source")}
                title={t("Remove source")}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={2.2} />
              </FocusButton>
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
        <FocusButton
          onClick={() => mutate(resetHomeRows())}
          className="mt-2 flex h-9 items-center gap-1.5 self-start rounded-lg border border-edge-soft/40 px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <RotateCcw size={13} strokeWidth={2.2} />
          {t("Reset to defaults")}
        </FocusButton>
      )}
    </div>
  );
}
