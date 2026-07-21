import { randomUUID } from "node:crypto";
import { getPotionDefinition } from "../../potion/getPotionDefinition";
import { collectReachableItemIds } from "../collectReachableItemIds";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { PlannedPotionUse } from "../PotionItemPlan";
import { firstFreeInventorySlot } from "./firstFreeInventorySlot";

export function planPotionUse(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
}): PlannedPotionUse | null {
  const before = input.items.find(
    (item) =>
      item.id === input.itemId && item.version === input.expectedVersion,
  );
  if (!before || before.count < 1) return null;
  const potion = getPotionDefinition(before.typeId);
  if (!potion) return null;
  if (before.count === 1) {
    const flaskAfter: Item = {
      ...before,
      typeId: potion.flaskTypeId,
      count: 1,
      attributes: {},
      version: before.version + 1,
    };
    return {
      itemPlan: { kind: "transform", before, flaskAfter },
      mutation: { before, after: [flaskAfter] },
    };
  }
  const potionAfter: Item = {
    ...before,
    count: before.count - 1,
    version: before.version + 1,
  };
  const reachable = collectReachableItemIds(input.items, input.characterId);
  const flaskMaxCount = input.catalog.require(potion.flaskTypeId).maxCount;
  const flaskBefore = input.items
    .filter(
      (item) =>
        reachable.has(item.id) &&
        item.typeId === potion.flaskTypeId &&
        item.count < flaskMaxCount,
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (flaskBefore) {
    const flaskAfter: Item = {
      ...flaskBefore,
      count: flaskBefore.count + 1,
      version: flaskBefore.version + 1,
    };
    return {
      itemPlan: {
        kind: "merge",
        before,
        potionAfter,
        flaskBefore,
        flaskAfter,
      },
      mutation: { before, after: [potionAfter, flaskAfter] },
    };
  }
  const slot = firstFreeInventorySlot(input.items);
  if (slot === null) return null;
  const flaskAfter: Item = {
    id: randomUUID(),
    typeId: potion.flaskTypeId,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "inventory", characterId: input.characterId, slot },
  };
  return {
    itemPlan: { kind: "create", before, potionAfter, flaskAfter },
    mutation: { before, after: [potionAfter, flaskAfter] },
  };
}
