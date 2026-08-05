import type { AwardType } from "./providers/wikidata";

export type AwardCategory = {
  key: string;
  name: string;
};

export type AwardMeta = {
  type: AwardType;
  title: string;
  shorthand: string;
  tagline: string;
  description: string;
  founded: number;
  categories: AwardCategory[];
};

export const AWARD_CATALOG: Record<AwardType, AwardMeta> = {
  oscar: {
    type: "oscar",
    title: "Academy Awards",
    shorthand: "The Oscars",
    tagline: "The Academy of Motion Picture Arts and Sciences · since 1929",
    description:
      "The most-watched film awards in the world. Voted on by ~10,000 working members of the film industry across 17 branches, from cinematographers to actors to costume designers.",
    founded: 1929,
    categories: [
      { key: "best_picture", name: "Best Picture" },
      { key: "best_director", name: "Best Director" },
      { key: "best_actor", name: "Best Actor" },
      { key: "best_actress", name: "Best Actress" },
      { key: "best_supporting_actor", name: "Best Supporting Actor" },
      { key: "best_supporting_actress", name: "Best Supporting Actress" },
      { key: "best_animated_feature", name: "Best Animated Feature" },
      { key: "best_international_feature", name: "Best International Feature" },
      { key: "best_adapted_screenplay", name: "Best Adapted Screenplay" },
      { key: "best_original_screenplay", name: "Best Original Screenplay" },
    ],
  },
  emmy: {
    type: "emmy",
    title: "Primetime Emmy Awards",
    shorthand: "The Emmys",
    tagline: "Television Academy · since 1949",
    description:
      "Television's highest honor. Presented annually by the Television Academy for excellence in primetime programming, with categories spanning drama, comedy, limited series, and acting.",
    founded: 1949,
    categories: [
      { key: "outstanding_drama_series", name: "Outstanding Drama Series" },
      { key: "outstanding_comedy_series", name: "Outstanding Comedy Series" },
      { key: "outstanding_limited_series", name: "Outstanding Limited Series" },
      { key: "lead_actor_drama", name: "Lead Actor · Drama" },
      { key: "lead_actress_drama", name: "Lead Actress · Drama" },
      { key: "lead_actor_comedy", name: "Lead Actor · Comedy" },
      { key: "lead_actress_comedy", name: "Lead Actress · Comedy" },
    ],
  },
  golden_globe: {
    type: "golden_globe",
    title: "Golden Globe Awards",
    shorthand: "Golden Globes",
    tagline: "Golden Globe Foundation · since 1944",
    description:
      "A sprawling celebration of both film and television. Famously loose, often the season's first major signal, and the only major awards that drink at the ceremony.",
    founded: 1944,
    categories: [
      { key: "best_picture_drama", name: "Best Motion Picture · Drama" },
      { key: "best_picture_musical_comedy", name: "Best Motion Picture · Musical or Comedy" },
      { key: "best_tv_drama", name: "Best Television Series · Drama" },
      { key: "best_tv_musical_comedy", name: "Best Television Series · Musical or Comedy" },
      { key: "best_director", name: "Best Director" },
      { key: "best_actor_drama", name: "Best Actor · Drama" },
      { key: "best_actress_drama", name: "Best Actress · Drama" },
    ],
  },
  bafta: {
    type: "bafta",
    title: "BAFTA Awards",
    shorthand: "BAFTAs",
    tagline: "British Academy of Film and Television Arts · since 1947",
    description:
      "Britain's answer to the Oscars, with a separate Television ceremony. Voted on by BAFTA's working membership of film and television professionals, often a strong predictor of Oscar outcomes.",
    founded: 1947,
    categories: [
      { key: "best_film", name: "Best Film" },
      { key: "best_director", name: "Best Director" },
      { key: "best_actor", name: "Best Actor in a Leading Role" },
      { key: "best_actress", name: "Best Actress in a Leading Role" },
    ],
  },
  sag: {
    type: "sag",
    title: "Screen Actors Guild Awards",
    shorthand: "SAG Awards",
    tagline: "SAG-AFTRA · since 1995",
    description:
      "The actors' awards: voted entirely by performers in the Screen Actors Guild union. Famous for the Outstanding Cast trophy, the closest thing in awards season to a 'Best Picture by performers' verdict.",
    founded: 1995,
    categories: [
      { key: "outstanding_cast_motion_picture", name: "Outstanding Cast in a Motion Picture" },
      { key: "outstanding_drama_ensemble", name: "Outstanding Ensemble · Drama Series" },
      { key: "outstanding_comedy_ensemble", name: "Outstanding Ensemble · Comedy Series" },
      { key: "lead_actor_motion_picture", name: "Outstanding Male Actor in a Leading Role" },
      { key: "lead_actress_motion_picture", name: "Outstanding Female Actor in a Leading Role" },
    ],
  },
  critics_choice: {
    type: "critics_choice",
    title: "Critics' Choice Awards",
    shorthand: "Critics' Choice",
    tagline: "Critics Choice Association · since 1995",
    description:
      "Voted by ~600 working film and television critics across the US and Canada. Typically tracks closely with eventual Oscar and Emmy outcomes, and announces a couple of weeks before either.",
    founded: 1995,
    categories: [
      { key: "best_picture", name: "Best Picture" },
      { key: "best_director", name: "Best Director" },
      { key: "best_actor", name: "Best Actor" },
      { key: "best_actress", name: "Best Actress" },
      { key: "best_drama_series", name: "Best Drama Series" },
      { key: "best_comedy_series", name: "Best Comedy Series" },
    ],
  },
  cannes: {
    type: "cannes",
    title: "Cannes Film Festival",
    shorthand: "Cannes",
    tagline: "Festival de Cannes · since 1946",
    description:
      "Held every May on the French Riviera. The Palme d'Or is arguably the most prestigious single film prize in cinema, decided by a small jury of filmmakers and actors.",
    founded: 1946,
    categories: [
      { key: "palme_dor", name: "Palme d'Or" },
      { key: "grand_prix", name: "Grand Prix" },
      { key: "best_director", name: "Best Director" },
    ],
  },
  venice: {
    type: "venice",
    title: "Venice Film Festival",
    shorthand: "Venice",
    tagline: "Mostra Internazionale d'Arte Cinematografica · since 1932",
    description:
      "The world's oldest film festival. The Golden Lion launches the autumn awards season every year and has become a reliable bellwether for the Oscars in the streaming era.",
    founded: 1932,
    categories: [
      { key: "golden_lion", name: "Golden Lion" },
      { key: "silver_lion_director", name: "Silver Lion · Best Director" },
    ],
  },
  berlin: {
    type: "berlin",
    title: "Berlin International Film Festival",
    shorthand: "Berlinale",
    tagline: "Berlin International Film Festival · since 1951",
    description:
      "The most political of the big three European festivals. The Golden Bear has gone to bold, often confrontational films from across the world for over seventy years.",
    founded: 1951,
    categories: [
      { key: "golden_bear", name: "Golden Bear" },
      { key: "silver_bear_director", name: "Silver Bear for Best Director" },
    ],
  },
  other: {
    type: "other",
    title: "Other Awards",
    shorthand: "Awards",
    tagline: "",
    description: "Various honors recognized in this title's award history.",
    founded: 0,
    categories: [],
  },
};
