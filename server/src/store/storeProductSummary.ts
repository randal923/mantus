import { STORE_LIMITS } from "@tibia/protocol";

const TAG_ONLY_LINE = /^\{[a-z0-9|]+\}$/i;

/**
 * The one line a shelf row shows under a product's name: the description's
 * first line that is prose rather than a `{character}`-style tag, cut at a
 * word boundary to the protocol's summary limit. Empty when the description
 * has no prose at all, in which case the row shows only the name.
 */
export function storeProductSummary(description: string): string {
  const line = description
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0 && !TAG_ONLY_LINE.test(candidate));
  if (!line) return "";
  const limit = STORE_LIMITS.maxSummaryLength;
  if (line.length <= limit) return line;
  const cut = line.lastIndexOf(" ", limit - 1);
  return `${line.slice(0, cut > limit / 2 ? cut : limit - 1).trimEnd()}…`;
}
