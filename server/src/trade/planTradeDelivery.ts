import { carriedWeight } from "../depot/carriedWeight";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { firstFreeContainerSlot } from "../item/plan/firstFreeContainerSlot";
import { firstFreeInventorySlot } from "../item/plan/firstFreeInventorySlot";
import { subtreeHeight } from "../item/plan/subtreeHeight";

/** Mirrors the carried-item cap enforced by the intent planners. */
const MAX_CARRIED_ITEMS = 500;

/**
 * Where one incoming trade leg lands for its receiver (Canary's
 * INDEX_WHEREEVER equivalent): the equipped backpack's first free slot when
 * the nesting limit allows, else the first free loose-inventory slot.
 * Enforces the receiver's weight capacity and carried-item cap; the same
 * rules run against memory and DB state so both stores agree.
 */
export function planTradeDelivery(input: {
  readonly catalog: ItemCatalog;
  readonly receiverCharacterId: string;
  readonly receiverItems: ReadonlyArray<Item>;
  readonly receiverCapacityMax: number;
  readonly legItems: ReadonlyArray<Item>;
}):
  | { readonly status: "ok"; readonly delivered: ReadonlyArray<Item> }
  | { readonly status: "no-capacity" | "no-room" } {
  const { catalog, receiverItems, legItems } = input;
  const root = legItems[0];
  if (!root) return { status: "no-room" };
  if (receiverItems.length + legItems.length > MAX_CARRIED_ITEMS) {
    return { status: "no-room" };
  }
  if (
    carriedWeight(catalog, receiverItems) + carriedWeight(catalog, legItems) >
    input.receiverCapacityMax * 100
  ) {
    return { status: "no-capacity" };
  }
  const backpack = receiverItems.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "backpack",
  );
  const height = subtreeHeight(legItems, root.id);
  const backpackSlot =
    backpack && height + 1 <= 8
      ? firstFreeContainerSlot(catalog, receiverItems, backpack)
      : null;
  const location =
    backpack && backpackSlot !== null
      ? ({
          kind: "container",
          containerId: backpack.id,
          slot: backpackSlot,
        } as const)
      : (() => {
          const slot = firstFreeInventorySlot(receiverItems);
          return slot === null
            ? null
            : ({
                kind: "inventory",
                characterId: input.receiverCharacterId,
                slot,
              } as const);
        })();
  if (!location) return { status: "no-room" };
  const moved: Item = { ...root, location, version: root.version + 1 };
  return { status: "ok", delivered: [moved, ...legItems.slice(1)] };
}
