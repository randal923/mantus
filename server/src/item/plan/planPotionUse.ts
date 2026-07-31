import { randomUUID } from "node:crypto";
import { getPotionDefinition } from "../../potion/getPotionDefinition";
import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { PlannedPotionUse } from "../PotionItemPlan";
import { planBackpackPlacement } from "./planBackpackPlacement";

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
  // The flask lands wherever a picked-up item would: top up the first partial
  // flask stack in the backpack tree, else the first free slot in it.
  const flask: Item = {
    id: randomUUID(),
    typeId: potion.flaskTypeId,
    count: 1,
    attributes: {},
    version: 1,
    location: before.location,
  };
  const placement = planBackpackPlacement({
    catalog: input.catalog,
    carried: input.items,
    item: flask,
    subtree: [flask],
  });
  // Canary drinks the potion either way and only hands the flask back when
  // the player can carry it, so a full backpack must never block the restore.
  if (!placement) {
    return {
      itemPlan: { kind: "discard", before, potionAfter },
      mutation: { before, after: [potionAfter] },
    };
  }
  const mergeTarget = placement.mergeTarget;
  if (mergeTarget) {
    const flaskAfter: Item = {
      ...mergeTarget,
      count: mergeTarget.count + 1,
      version: mergeTarget.version + 1,
    };
    return {
      itemPlan: {
        kind: "merge",
        before,
        potionAfter,
        flaskBefore: mergeTarget,
        flaskAfter,
      },
      mutation: { before, after: [potionAfter, flaskAfter] },
    };
  }
  const flaskAfter: Item = { ...flask, location: placement.location };
  return {
    itemPlan: { kind: "create", before, potionAfter, flaskAfter },
    mutation: { before, after: [potionAfter, flaskAfter] },
  };
}
