export type LandingNewsArticleData = {
  /** Locale key under `landing.news.items.<id>`. */
  id: string;
  image?: { src: string };
};

/** Every published news article, newest first. Ticker and articles both read from this. */
export const LANDING_NEWS_ARTICLES: readonly LandingNewsArticleData[] = [
  { id: "gatesOpen", image: { src: "/images/landing/astral-vault.webp" } },
];
