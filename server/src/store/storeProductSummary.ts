import { STORE_LIMITS } from "@tibia/protocol";

const LEADING_TAG = /^\{[a-z0-9|]+\}\s*/i;

/**
 * The one line a shelf row shows under a product's name: the description's
 * first line of plain prose, or — when every line is tagged — the first
 * tagged line with its `{info}`-style marker stripped. Cut at a word boundary
 * to the protocol's summary limit; empty when there is no text at all, in
 * which case the row shows only the name.
 */
export function storeProductSummary(description: string): string {
  const lines = description
    .split("\n")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
  const line =
    lines.find((candidate) => !LEADING_TAG.test(candidate)) ??
    lines
      .map((candidate) => candidate.replace(LEADING_TAG, ""))
      .find((candidate) => candidate.length > 0);
  if (!line) return "";
  const limit = STORE_LIMITS.maxSummaryLength;
  if (line.length <= limit) return line;
  const cut = line.lastIndexOf(" ", limit - 1);
  return `${line.slice(0, cut > limit / 2 ? cut : limit - 1).trimEnd()}…`;
}
