import { IMBUEMENT_RULES, type ImbuementOption } from "@tibia/protocol";
import type { ItemImbuementEntry } from "../forge/itemImbuementsOf";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ImbuementCatalog } from "./ImbuementCatalog";
import { imbuementBlockedReasonOf } from "./imbuementBlockedReasonOf";

/**
 * Projects the window's imbuement list. Options the item cannot take are kept
 * and marked with a `blockedReason` rather than dropped, so the client can
 * render Tibia's Basic/Intricate/Powerful buttons with the ineligible tiers
 * greyed instead of missing. Every verdict is advisory; apply re-checks it.
 */
export function buildImbuementOptions(input: {
  readonly catalog: ImbuementCatalog;
  readonly itemCatalog: ItemCatalog;
  /** The item's per-category power levels; null in scroll mode. */
  readonly imbuementTypes: Readonly<Record<string, number>> | null;
  readonly currentStates: ReadonlyArray<ItemImbuementEntry>;
  readonly premium: boolean;
  readonly mode: "item" | "scroll";
  readonly blankScrollCount: number;
  readonly carriedCountOf: (itemTypeId: number) => number;
  readonly stashCountOf: (itemTypeId: number) => number;
}): ImbuementOption[] {
  const { catalog, itemCatalog, imbuementTypes, currentStates, mode } = input;
  const options: ImbuementOption[] = [];
  for (const definition of catalog.imbuements.values()) {
    const base = catalog.bases.get(definition.baseId);
    if (!base) continue;
    // Scroll mode can only forge imbuements that have a scroll item.
    if (mode === "scroll" && definition.scrollItemTypeId === undefined) continue;
    const materials = definition.astralSources.map((source) => {
      const stashAvailable = input.stashCountOf(source.itemTypeId);
      return {
        itemTypeId: source.itemTypeId,
        name: itemCatalog.get(source.itemTypeId)?.name ?? "unknown",
        count: source.count,
        available: input.carriedCountOf(source.itemTypeId) + stashAvailable,
        stashAvailable,
      };
    });
    const blockedReason = imbuementBlockedReasonOf({
      allowedLevel: imbuementTypes?.[definition.categorySlug] ?? 0,
      baseId: definition.baseId,
      constrainedByItem: mode === "item",
      premiumRequired: definition.premium,
      premium: input.premium,
      duplicate: currentStates.some(
        (state) =>
          catalog.imbuements.get(state.imbuementId)?.categorySlug ===
          definition.categorySlug,
      ),
      materialsCovered: materials.every(
        (material) => material.available >= material.count,
      ),
      blankScrollMissing: mode === "scroll" && input.blankScrollCount === 0,
    });
    options.push({
      imbuementId: definition.id,
      name: definition.name,
      baseId: definition.baseId,
      baseName: base.name,
      categorySlug: definition.categorySlug,
      iconId: definition.iconId + (definition.baseId - 1),
      description: definition.description,
      priceGold: base.priceGold,
      premium: definition.premium,
      materials,
      canApply: blockedReason === null,
      blockedReason,
    });
  }
  options.sort(
    (left, right) =>
      left.categorySlug.localeCompare(right.categorySlug) ||
      left.baseId - right.baseId ||
      left.name.localeCompare(right.name),
  );
  return options.slice(0, IMBUEMENT_RULES.maxWindowOptions);
}
