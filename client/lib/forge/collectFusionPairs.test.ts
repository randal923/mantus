import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { collectFusionPairs } from "./collectFusionPairs";
import { collectTransferDonors } from "./collectTransferDonors";
import { collectTransferReceivers } from "./collectTransferReceivers";
import { itemClassificationOf } from "./itemClassificationOf";

let nextId = 0;

function makeItem(input: {
  typeId: number;
  name: string;
  classification: number;
  tier: number;
  equipmentSlot?: InventoryItem["equipmentSlot"];
}): InventoryItem {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    typeId: input.typeId,
    clientId: input.typeId,
    spriteId: 1652,
    name: input.name,
    stackable: false,
    maxCount: 1,
    count: 1,
    revision: 1,
    equipmentSlot: input.equipmentSlot ?? "armor",
    tier: input.tier,
    tooltip: {
      name: input.name,
      typeLine: "Armors",
      spriteId: 1652,
      affixes: [
        {
          text: `Classification: ${input.classification} Tier: ${input.tier}`,
        },
      ],
      weight: 100,
    },
  };
}

function makeInventory(
  items: ReadonlyArray<InventoryItem>,
): InventoryState {
  return {
    revision: 1,
    equipment: {},
    items: items.map((item, slot) => ({ slot, item })),
    gold: 0,
    platinum: 0,
    crystal: 0,
    capacityUsed: 0,
    usedWeight: 0,
    capacityMax: 1_000,
    slotCount: items.length,
  };
}

describe("itemClassificationOf", () => {
  it("reads the server-authored classification affix", () => {
    const item = makeItem({
      typeId: 1,
      name: "magic plate armor",
      classification: 4,
      tier: 3,
    });
    expect(itemClassificationOf(item)).toBe(4);
  });

  it("returns 0 for unclassified items", () => {
    const item = makeItem({ typeId: 1, name: "apple", classification: 1, tier: 0 });
    const unclassified = {
      ...item,
      tooltip: { ...item.tooltip, affixes: [] },
    };
    expect(itemClassificationOf(unclassified)).toBe(0);
  });
});

describe("collectFusionPairs", () => {
  it("groups two identical same-tier items into one pair", () => {
    const first = makeItem({ typeId: 5, name: "crown armor", classification: 4, tier: 1 });
    const second = makeItem({ typeId: 5, name: "crown armor", classification: 4, tier: 1 });
    const pairs = collectFusionPairs(makeInventory([first, second]));
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.firstItemId).toBe(first.id);
    expect(pairs[0]?.secondItemId).toBe(second.id);
    expect(pairs[0]?.count).toBe(2);
  });

  it("never pairs items of different tiers", () => {
    const first = makeItem({ typeId: 5, name: "crown armor", classification: 4, tier: 1 });
    const second = makeItem({ typeId: 5, name: "crown armor", classification: 4, tier: 2 });
    expect(collectFusionPairs(makeInventory([first, second]))).toHaveLength(0);
  });

  it("drops pairs already at the classification tier cap", () => {
    const first = makeItem({ typeId: 5, name: "ring", classification: 1, tier: 1 });
    const second = makeItem({ typeId: 5, name: "ring", classification: 1, tier: 1 });
    expect(collectFusionPairs(makeInventory([first, second]))).toHaveLength(0);
  });
});

describe("collectTransferDonors and collectTransferReceivers", () => {
  it("keeps only tier 2+ donors and matching tier 0 receivers", () => {
    const donor = makeItem({ typeId: 5, name: "crown armor", classification: 4, tier: 2 });
    const lowTier = makeItem({ typeId: 6, name: "plate armor", classification: 4, tier: 1 });
    const receiver = makeItem({ typeId: 7, name: "noble armor", classification: 4, tier: 0 });
    const wrongSlot = makeItem({
      typeId: 8,
      name: "crown helmet",
      classification: 4,
      tier: 0,
      equipmentSlot: "helmet",
    });
    const inventory = makeInventory([donor, lowTier, receiver, wrongSlot]);

    const donors = collectTransferDonors(inventory);
    expect(donors.map((item) => item.id)).toEqual([donor.id]);

    const receivers = collectTransferReceivers(inventory, donor);
    expect(receivers.map((item) => item.id)).toEqual([receiver.id]);
  });
});
