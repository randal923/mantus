import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import { firstFreeContainerSlot } from "../item/plan/firstFreeContainerSlot";

/**
 * Returns a reserved offer to its owner. The original spot may be gone or
 * occupied, so the root lands in the first free equipped-backpack slot; the
 * nested contents follow the root untouched. Without room the offer remains
 * reserved and login recovery retries.
 */
export function planTradeRestore(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly snapshot: ReadonlyArray<Item>;
}): CarriedPlan | null {
  const root = input.snapshot[0];
  if (!root || root.location.kind !== "trade-reservation") return null;
  const backpack = input.items.find(
    (item) =>
      item.location.kind === "equipment" &&
      item.location.characterId === input.characterId &&
      item.location.slot === "backpack",
  );
  if (!backpack) return null;
  const slot = firstFreeContainerSlot(input.catalog, input.items, backpack);
  if (slot === null) return null;
  const restored: Item = {
    ...root,
    location: { kind: "container", containerId: backpack.id, slot },
    version: root.version + 1,
  };
  return {
    mutation: { after: [restored, ...input.snapshot.slice(1)] },
    persist: {
      characterId: input.characterId,
      rowOps: [
        { kind: "write", expectedVersion: root.version, item: restored },
      ],
      audits: [
        {
          kind: "transfer",
          itemId: root.id,
          from: root.location,
          to: restored.location,
          count: restored.count,
        },
      ],
    },
  };
}
