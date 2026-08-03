import type { InventoryItem, InventoryState } from "@tibia/protocol";

function makeTrackedItem(input: {
  id: string;
  typeId: number;
  spriteId: number;
  name: string;
  slots: number;
  imbuements?: InventoryItem["imbuements"];
}): InventoryItem {
  return {
    id: input.id,
    typeId: input.typeId,
    clientId: input.typeId,
    spriteId: input.spriteId,
    name: input.name,
    stackable: false,
    maxCount: 1,
    count: 1,
    revision: 1,
    ...(input.imbuements ? { imbuements: input.imbuements } : {}),
    tooltip: {
      name: input.name,
      typeLine: "Armors",
      spriteId: input.spriteId,
      affixes: [{ text: `Imbuement Slots ${input.slots}` }],
      weight: 12_000,
    },
  };
}

/** One piece per urgency band, plus a slotted piece with nothing running. */
export const IMBUEMENT_TRACKER_INVENTORY: InventoryState = {
  revision: 12,
  equipment: {
    helmet: makeTrackedItem({
      id: "00000000-0000-4000-8000-0000000000a1",
      typeId: 3392,
      spriteId: 5559,
      name: "royal helmet",
      slots: 2,
      imbuements: [
        {
          slot: 0,
          name: "Powerful Vampirism",
          iconId: 21,
          remainingSeconds: 61_200,
          aggressive: true,
        },
      ],
    }),
    armor: makeTrackedItem({
      id: "00000000-0000-4000-8000-0000000000a2",
      typeId: 3366,
      spriteId: 5551,
      name: "magic plate armor",
      slots: 1,
      imbuements: [
        {
          slot: 0,
          name: "Intricate Lich Shroud",
          iconId: 41,
          remainingSeconds: 7_320,
          aggressive: false,
        },
      ],
    }),
    weapon: makeTrackedItem({
      id: "00000000-0000-4000-8000-0000000000a3",
      typeId: 7402,
      spriteId: 10_026,
      name: "dragon slayer",
      slots: 3,
      imbuements: [
        {
          slot: 0,
          name: "Powerful Scorch",
          iconId: 15,
          remainingSeconds: 2_700,
          aggressive: true,
        },
        {
          slot: 2,
          name: "Basic Strike",
          iconId: 25,
          remainingSeconds: 45,
          aggressive: true,
        },
      ],
    }),
    boots: makeTrackedItem({
      id: "00000000-0000-4000-8000-0000000000a4",
      typeId: 3079,
      spriteId: 4517,
      name: "boots of haste",
      slots: 1,
    }),
  },
  items: [],
  gold: 0,
  platinum: 0,
  crystal: 0,
  capacityUsed: 0,
  usedWeight: 0,
  capacityMax: 1_000,
  slotCount: 0,
};
