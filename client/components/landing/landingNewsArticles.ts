/** Live game-component mock rendered below a section's paragraphs. */
export type LandingNewsSectionVisual =
  | "itemRarity"
  | "lootFilter"
  | "huntingBot"
  | "huntFinder";

export type LandingNewsSectionData = {
  /** Locale key under `landing.news.items.<article>.sections.<id>`. */
  id: string;
  visual?: LandingNewsSectionVisual;
};

export type LandingNewsArticleImageData = {
  src: string;
  /** Intrinsic pixel size, for the full-size lightbox render. */
  width: number;
  height: number;
};

export type LandingNewsArticleData = {
  /** Locale key under `landing.news.items.<id>`. */
  id: string;
  image?: LandingNewsArticleImageData;
  sections?: readonly LandingNewsSectionData[];
};

/** Every published news article, newest first. Ticker and articles both read from this. */
export const LANDING_NEWS_ARTICLES: readonly LandingNewsArticleData[] = [
  {
    id: "gatesOpen",
    image: { src: "/images/landing/mantus-gameplay.webp", width: 1600, height: 796 },
    sections: [
      { id: "bot", visual: "huntingBot" },
      { id: "huntFinder", visual: "huntFinder" },
      { id: "pvp" },
      { id: "rarity", visual: "itemRarity" },
      { id: "autoloot", visual: "lootFilter" },
      { id: "beta" },
    ],
  },
];
