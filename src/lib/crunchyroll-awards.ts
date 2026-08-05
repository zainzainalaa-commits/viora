import data from "@/data/crunchyroll-awards.json";
import { animeFranchiseKey, stripFranchiseSuffix } from "@/lib/providers/jikan";

export type CrunchyrollWin = {
  year: number;
  categoryKey: string;
  categoryName: string;
  title: string;
};

type Raw = {
  source: string;
  updatedAt: string;
  categories: Record<string, { name: string; winners: { year: number; title: string }[] }>;
};

const raw = data as Raw;

const ANIME_OF_THE_YEAR_KEY = "anime_of_the_year";

const index: Map<string, CrunchyrollWin[]> = (() => {
  const out = new Map<string, CrunchyrollWin[]>();
  for (const [key, bucket] of Object.entries(raw.categories)) {
    for (const w of bucket.winners) {
      const fk = animeFranchiseKey(stripFranchiseSuffix(w.title));
      const arr = out.get(fk) ?? [];
      arr.push({
        year: w.year,
        categoryKey: key,
        categoryName: bucket.name,
        title: w.title,
      });
      out.set(fk, arr);
    }
  }
  return out;
})();

export function findCrunchyrollWins(animeName: string): CrunchyrollWin[] {
  if (!animeName) return [];
  const fk = animeFranchiseKey(stripFranchiseSuffix(animeName));
  const list = index.get(fk);
  if (!list) return [];
  return list.slice().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (a.categoryKey === ANIME_OF_THE_YEAR_KEY) return -1;
    if (b.categoryKey === ANIME_OF_THE_YEAR_KEY) return 1;
    return a.categoryName.localeCompare(b.categoryName);
  });
}

export function findTopCrunchyrollWin(animeName: string): CrunchyrollWin | null {
  const list = findCrunchyrollWins(animeName);
  return list[0] ?? null;
}

export function allCrunchyrollAwards(): CrunchyrollWin[] {
  const out: CrunchyrollWin[] = [];
  for (const [key, bucket] of Object.entries(raw.categories)) {
    for (const w of bucket.winners) {
      out.push({
        year: w.year,
        categoryKey: key,
        categoryName: bucket.name,
        title: w.title,
      });
    }
  }
  return out;
}

export function uniqueWinnerFranchises(): Map<string, CrunchyrollWin> {
  const out = new Map<string, CrunchyrollWin>();
  for (const a of allCrunchyrollAwards()) {
    const fk = animeFranchiseKey(stripFranchiseSuffix(a.title));
    const existing = out.get(fk);
    if (!existing) {
      out.set(fk, a);
      continue;
    }
    if (a.year > existing.year) out.set(fk, a);
    else if (
      a.year === existing.year &&
      a.categoryKey === ANIME_OF_THE_YEAR_KEY &&
      existing.categoryKey !== ANIME_OF_THE_YEAR_KEY
    ) {
      out.set(fk, a);
    }
  }
  return out;
}

export const CRUNCHYROLL_AWARDS_META = {
  source: raw.source,
  updatedAt: raw.updatedAt,
};
