import type { InventoryItem } from "@tibia/protocol";

const CLASSIFICATION_AFFIX = /^Classification: (\d+) Tier: \d+$/;

/**
 * Reads the forge classification from the server-authored tooltip affix
 * ("Classification: X Tier: Y"). Display-only — the server re-derives the
 * classification from its own catalog on every forge intent.
 */
export function itemClassificationOf(item: InventoryItem): number {
  for (const affix of item.tooltip.affixes) {
    const match = CLASSIFICATION_AFFIX.exec(affix.text);
    if (match) return Number(match[1]);
  }
  return 0;
}
