import type { Item } from "../item/Item";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import { firstFreeInventorySlot } from "../item/plan/firstFreeInventorySlot";

/**
 * Returns a reserved offer to its owner. The original spot may be gone or
 * occupied, so the root lands on the first free loose-inventory slot; the
 * nested contents follow the root untouched. Null only when all 100 loose
 * slots are taken — the offer then stays reserved and login recovery retries.
 */
export function planTradeRestore(input: {
  readonly characterId: string;
  readonly items: ReadonlyArray<Item>;
  readonly snapshot: ReadonlyArray<Item>;
}): CarriedPlan | null {
  const root = input.snapshot[0];
  if (!root || root.location.kind !== "trade-reservation") return null;
  const slot = firstFreeInventorySlot(input.items);
  if (slot === null) return null;
  const restored: Item = {
    ...root,
    location: { kind: "inventory", characterId: input.characterId, slot },
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
