import { itemTooltipSchema, type LootFilterItem } from "@tibia/protocol";

/**
 * Reads the generated creature-loot asset. It is a build artefact rather than
 * server data, so anything malformed is dropped silently — a bad entry must
 * not empty the search pane.
 */
export function parseCreatureLootCatalog(
  value: unknown,
): ReadonlyArray<LootFilterItem> {
  if (typeof value !== "object" || value === null) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const parsed: LootFilterItem[] = [];
  for (const entry of items) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, spriteId, tooltip } = entry as Record<string, unknown>;
    if (
      typeof id !== "number" ||
      !Number.isInteger(id) ||
      id <= 0 ||
      typeof name !== "string" ||
      name.length === 0 ||
      typeof spriteId !== "number" ||
      !Number.isInteger(spriteId)
    ) {
      continue;
    }
    const parsedTooltip = itemTooltipSchema.safeParse(tooltip);
    if (!parsedTooltip.success) continue;
    parsed.push({ typeId: id, name, spriteId, tooltip: parsedTooltip.data });
  }
  return parsed;
}
