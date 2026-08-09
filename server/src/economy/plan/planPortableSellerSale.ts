import { BANK_LIMITS } from "@tibia/protocol";
import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../../item/CarriedPersistPlan";
import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemMutation } from "../../item/ItemMutation";
import { ITEM_POUCH_TYPE_ID } from "../../item/itemPouchTypeId";
import { itemRarityOf } from "../../rarity/itemRarityOf";
import type { EconomyPersistPlan } from "../EconomyPersistPlan";

/**
 * One Portable Seller sweep: vendors every sellable direct child of the loot
 * pouch at its catalog NPC value and credits the whole proceeds to the bank.
 * Mirrors the NPC bulk-sale exclusions — never a rarity-graded item, never a
 * container that still holds something. Items no NPC pays for stay in the
 * pouch. Returns null when there is nothing to sell (or the pouch is
 * missing), which callers treat as "no sale happened".
 */
export function planPortableSellerSale(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly bankBalance: number;
}): {
  readonly mutation: ItemMutation;
  readonly persist: EconomyPersistPlan;
  /** Units sold, counting every item in every stack. */
  readonly soldCount: number;
  readonly proceeds: number;
  readonly bankBalanceAfter: number;
} | null {
  const { characterId, catalog, items, bankBalance } = input;
  const pouch = items.find(
    (candidate) => candidate.typeId === ITEM_POUCH_TYPE_ID,
  );
  if (!pouch) return null;
  const parentIds = new Set<string>();
  for (const candidate of items) {
    if (
      candidate.location.kind === "container" ||
      candidate.location.kind === "corpse"
    ) {
      parentIds.add(candidate.location.containerId);
    }
  }
  const sellable = items
    .filter(
      (candidate) =>
        candidate.location.kind === "container" &&
        candidate.location.containerId === pouch.id &&
        !parentIds.has(candidate.id) &&
        // A sweep must never silently vendor a rarity-graded item at the
        // base price; those leave only via market or trade.
        itemRarityOf(candidate) === undefined &&
        (catalog.require(candidate.typeId).npcValue ?? 0) > 0,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (sellable.length === 0) return null;

  let proceeds = 0;
  let soldCount = 0;
  const rowOps: CarriedPersistRowOp[] = [];
  const audits: CarriedPersistAudit[] = [];
  const removedItemIds: string[] = [];
  for (const item of sellable) {
    const unitValue = catalog.require(item.typeId).npcValue ?? 0;
    proceeds += unitValue * item.count;
    soldCount += item.count;
    removedItemIds.push(item.id);
    rowOps.push({
      kind: "delete",
      itemId: item.id,
      expectedVersion: item.version,
    });
    audits.push({
      kind: "destruction",
      itemId: item.id,
      typeId: item.typeId,
      count: item.count,
      reason: "portable-seller-sale",
    });
  }
  const bankBalanceAfter = bankBalance + proceeds;
  if (bankBalanceAfter > BANK_LIMITS.maxBalance) return null;

  return {
    mutation: { after: [], removedItemIds },
    persist: {
      carried: { characterId, rowOps, audits },
      bankOps: [
        {
          characterId,
          delta: proceeds,
          expectedBalanceAfter: bankBalanceAfter,
          ledger: "portable-seller-sale",
        },
      ],
      audits: [
        {
          kind: "portable-seller-sale",
          itemCount: soldCount,
          stackCount: sellable.length,
          totalProceeds: proceeds,
          balanceAfter: bankBalanceAfter,
        },
      ],
    },
    soldCount,
    proceeds,
    bankBalanceAfter,
  };
}
