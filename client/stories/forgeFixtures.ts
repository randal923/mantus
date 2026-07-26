import type {
  ForgeHistoryStateMessage,
  ForgeResultMessage,
  ForgeStateMessage,
  ImbuementWindowStateMessage,
  InventoryItem,
  InventoryState,
} from "@tibia/protocol";

function makeForgeItem(input: {
  id: string;
  typeId: number;
  spriteId: number;
  name: string;
  classification: number;
  tier: number;
  equipmentSlot: NonNullable<InventoryItem["equipmentSlot"]>;
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
    equipmentSlot: input.equipmentSlot,
    tier: input.tier,
    tooltip: {
      name: input.name,
      typeLine: "Armors",
      spriteId: input.spriteId,
      affixes: [
        {
          text: `Classification: ${input.classification} Tier: ${input.tier}`,
        },
      ],
      weight: 12_000,
    },
  };
}

export const FORGE_STATE: ForgeStateMessage = {
  type: "forge-state",
  dusts: 85,
  dustLimit: 100,
  slivers: 120,
  cores: 3,
};

export const FORGE_RESULT: ForgeResultMessage = {
  type: "forge-result",
  action: "fusion",
  convergence: false,
  success: true,
  bonus: 3,
  itemTypeId: 3366,
  resultTier: 2,
};

export const FORGE_HISTORY: ForgeHistoryStateMessage = {
  type: "forge-history-state",
  page: 0,
  totalPages: 2,
  entries: [
    {
      at: 1_753_500_000_000,
      action: "fusion",
      convergence: false,
      success: true,
      bonus: 3,
      tier: 2,
      description: "magic plate armor (tier 1 -> 2)",
      costGold: 0,
      costDust: 100,
      costCores: 1,
      gained: 0,
    },
    {
      at: 1_753_400_000_000,
      action: "dust-to-slivers",
      convergence: false,
      success: true,
      bonus: 0,
      tier: 0,
      description: "60 dust -> 3 slivers",
      costGold: 0,
      costDust: 60,
      costCores: 0,
      gained: 3,
    },
    {
      at: 1_753_300_000_000,
      action: "transfer",
      convergence: false,
      success: true,
      bonus: 0,
      tier: 1,
      description: "crown armor -> magic plate armor (tier 1)",
      costGold: 25_000,
      costDust: 100,
      costCores: 1,
      gained: 0,
    },
  ],
};

/** Two fusible tier-1 armors, a tier-2 donor, and a tier-0 receiver. */
export const FORGE_INVENTORY: InventoryState = {
  revision: 4,
  equipment: {},
  items: [
    {
      slot: 0,
      item: makeForgeItem({
        id: "00000000-0000-4000-8000-000000000001",
        typeId: 3366,
        spriteId: 1652,
        name: "magic plate armor",
        classification: 4,
        tier: 1,
        equipmentSlot: "armor",
      }),
    },
    {
      slot: 1,
      item: makeForgeItem({
        id: "00000000-0000-4000-8000-000000000002",
        typeId: 3366,
        spriteId: 1652,
        name: "magic plate armor",
        classification: 4,
        tier: 1,
        equipmentSlot: "armor",
      }),
    },
    {
      slot: 2,
      item: makeForgeItem({
        id: "00000000-0000-4000-8000-000000000003",
        typeId: 3381,
        spriteId: 1663,
        name: "crown armor",
        classification: 4,
        tier: 2,
        equipmentSlot: "armor",
      }),
    },
    {
      slot: 3,
      item: makeForgeItem({
        id: "00000000-0000-4000-8000-000000000004",
        typeId: 3370,
        spriteId: 1657,
        name: "plate armor",
        classification: 4,
        tier: 0,
        equipmentSlot: "armor",
      }),
    },
  ],
  gold: 150_000,
  platinum: 0,
  crystal: 0,
  capacityUsed: 480,
  usedWeight: 48_000,
  capacityMax: 1_200,
  slotCount: 20,
};

export const IMBUEMENT_WINDOW: ImbuementWindowStateMessage = {
  type: "imbuement-window-state",
  itemId: "00000000-0000-4000-8000-000000000001",
  itemTypeId: 3366,
  slotCount: 2,
  slots: [
    {
      slot: 0,
      imbuementId: 5,
      name: "Intricate Vampirism",
      baseName: "Intricate",
      iconId: 5,
      remainingSeconds: 61_200,
    },
    {
      slot: 1,
      imbuementId: null,
      name: null,
      baseName: null,
      iconId: null,
      remainingSeconds: 0,
    },
  ],
  options: [
    {
      imbuementId: 1,
      name: "Basic Vampirism",
      baseId: 1,
      baseName: "Basic",
      categorySlug: "vampirism",
      iconId: 1,
      description: "Converts 5% of physical damage dealt into health.",
      priceGold: 5_000,
      premium: false,
      materials: [
        { itemTypeId: 9685, name: "vampire teeth", count: 25, available: 25 },
      ],
      canApply: true,
    },
    {
      imbuementId: 5,
      name: "Intricate Vampirism",
      baseId: 2,
      baseName: "Intricate",
      categorySlug: "vampirism",
      iconId: 5,
      description: "Converts 10% of physical damage dealt into health.",
      priceGold: 25_000,
      premium: false,
      materials: [
        { itemTypeId: 9685, name: "vampire teeth", count: 25, available: 25 },
        { itemTypeId: 9663, name: "bloody pincers", count: 15, available: 4 },
      ],
      canApply: false,
    },
    {
      imbuementId: 12,
      name: "Basic Void",
      baseId: 1,
      baseName: "Basic",
      categorySlug: "void",
      iconId: 12,
      description: "Converts 3% of damage dealt into mana.",
      priceGold: 5_000,
      premium: true,
      materials: [
        { itemTypeId: 9640, name: "rope belt", count: 25, available: 30 },
      ],
      canApply: true,
    },
  ],
  removeCostGold: 15_000,
};
