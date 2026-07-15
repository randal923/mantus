import type { TFunction } from "i18next";
import type { Equipment, InventoryItem } from "./inventoryTypes";

interface PlaceholderInventory {
  characterName: string;
  equipment: Equipment;
  items: InventoryItem[];
  gold: number;
  platinum: number;
  capacityUsed: number;
  capacityMax: number;
}

export function getPlaceholderInventory(
  t: TFunction,
  characterName: string,
  capacityMax: number,
): PlaceholderInventory {
  return {
    characterName,
    equipment: {
      helmet: {
        id: "eq-1",
        clientId: 3351,
        spriteId: 7837,
        name: t("items.steelHelmet"),
        count: 1,
      },
      armor: {
        id: "eq-2",
        clientId: 3357,
        spriteId: 7843,
        name: t("items.plateArmor"),
        count: 1,
      },
      weapon: {
        id: "eq-3",
        clientId: 3280,
        spriteId: 7749,
        name: t("items.fireSword"),
        count: 1,
      },
      backpack: {
        id: "eq-4",
        clientId: 2854,
        spriteId: 7137,
        name: t("items.backpack"),
        count: 1,
      },
    },
    items: [
      {
        id: "it-1",
        clientId: 3031,
        spriteId: 7384,
        name: t("items.goldCoin"),
        count: 100,
      },
      {
        id: "it-2",
        clientId: 239,
        spriteId: 4344,
        name: t("items.greatHealthPotion"),
        count: 5,
      },
      {
        id: "it-3",
        clientId: 3577,
        spriteId: 8161,
        name: t("items.meat"),
        count: 3,
      },
    ],
    gold: 100,
    platinum: 0,
    capacityUsed: 62,
    capacityMax,
  };
}
