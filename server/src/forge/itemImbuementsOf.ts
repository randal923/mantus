import type { Item } from "../item/Item";

export interface ItemImbuementEntry {
  readonly slot: number;
  readonly imbuementId: number;
  readonly remainingSeconds: number;
  /** Display label written at apply time, e.g. "Powerful Scorch". */
  readonly name?: string;
  /**
   * Tier-resolved icon, denormalized at apply time for the same reason as
   * `name`: item projections run without the imbuement catalog. Absent on
   * entries written before the equipment badges shipped, which render the
   * placeholder icon until the imbuement is re-applied.
   */
  readonly iconId?: number;
  /**
   * Category aggressiveness, denormalized for the same reason as `iconId`.
   * Absent on entries written before the imbuement tracker shipped; projections
   * read those as aggressive, which stalls the client's display countdown out
   * of combat instead of running it too fast.
   */
  readonly aggressive?: boolean;
}

/** Imbuement slot states from the item's attribute bag; invalid shapes read empty. */
export function itemImbuementsOf(item: Item): ReadonlyArray<ItemImbuementEntry> {
  const raw = item.attributes.imbuements;
  if (!Array.isArray(raw)) return [];
  const entries: ItemImbuementEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { slot, imbuementId, remainingSeconds } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof slot !== "number" ||
      typeof imbuementId !== "number" ||
      typeof remainingSeconds !== "number" ||
      remainingSeconds <= 0
    ) {
      continue;
    }
    const { name, iconId, aggressive } = entry as Record<string, unknown>;
    entries.push({
      slot,
      imbuementId,
      remainingSeconds,
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof iconId === "number" ? { iconId } : {}),
      ...(typeof aggressive === "boolean" ? { aggressive } : {}),
    });
  }
  return entries;
}
