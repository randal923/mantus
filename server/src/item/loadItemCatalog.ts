import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EQUIPMENT_SLOTS } from "@tibia/protocol";
import { ItemCatalog } from "./ItemCatalog";
import type { ItemType } from "./ItemType";

const CATALOG_PATH = fileURLToPath(
  new URL("../../data/item-catalog.json", import.meta.url),
);
const STOWABLE_TYPES_PATH = fileURLToPath(
  new URL("../../data/stowable-item-types.json", import.meta.url),
);
const EXPECTED_SOURCE = {
  assetEra: "Tibia 15.11 extended",
  canaryCommit: "a879c9312e34381e8eedf397b8ed44510698b689",
  canaryItemsSha256:
    "f7f60d81a7b7b613b32328b0cd921cb222b45ec49d31b0d01af6a67a74a687ed",
  canaryFoodsSha256:
    "d561ef0e3c583b7f08415e29b7da91cc6956ce2b2a99b87f27f18d0426b55cde",
  canaryDoorsSha256:
    "03e1d4a7a5a2902bd748db9ca963d3947c7a60fb2a53358c999f259e28c7c614",
  datSha256: "e25fadcf0cd9140cff8c89fa94026438d7c42322c6e23a71b1da5471a317b057",
  sprSha256: "a7085447ddaa340ada42bfa71aed5f41582b1cd368f4a781b0464594f3c9b9ee",
} as const;
const EXPECTED_STOWABLE_SOURCE = {
  canaryCommit: EXPECTED_SOURCE.canaryCommit,
  path: "data/items/appearances.dat",
  sha256: "aa44a154f30c7ed59acc25f246286396e4043851ef0b54ef3cf3951e46d1ce50",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseItem(value: unknown, key: string): ItemType {
  if (!isRecord(value)) throw new Error(`item catalog entry ${key} is invalid`);
  const id = Number(key);
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    id > 65_535 ||
    value.id !== id ||
    value.clientId !== id ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !Number.isInteger(value.spriteId) ||
    Number(value.spriteId) <= 0 ||
    typeof value.stackable !== "boolean" ||
    !Number.isInteger(value.maxCount) ||
    Number(value.maxCount) < 1 ||
    Number(value.maxCount) > 100 ||
    !Number.isInteger(value.weight) ||
    Number(value.weight) < 0 ||
    typeof value.pickupable !== "boolean" ||
    typeof value.movable !== "boolean" ||
    !isRecord(value.light) ||
    !Number.isInteger(value.light.intensity) ||
    !Number.isInteger(value.light.color) ||
    !isRecord(value.render)
  ) {
    throw new Error(`item catalog entry ${key} is invalid`);
  }
  if (
    value.equipmentSlot !== undefined &&
    !EQUIPMENT_SLOTS.includes(value.equipmentSlot as (typeof EQUIPMENT_SLOTS)[number])
  ) {
    throw new Error(`item catalog entry ${key} has an invalid equipment slot`);
  }
  return value as unknown as ItemType;
}

export async function loadItemCatalog(): Promise<ItemCatalog> {
  const [catalogContents, stowableContents] = await Promise.all([
    readFile(CATALOG_PATH, "utf8"),
    readFile(STOWABLE_TYPES_PATH, "utf8"),
  ]);
  const parsed: unknown = JSON.parse(catalogContents);
  if (!isRecord(parsed) || parsed.formatVersion !== 2) {
    throw new Error("item catalog has an unsupported format version");
  }
  if (!isRecord(parsed.source)) {
    throw new Error("item catalog does not match the pinned asset sources");
  }
  const source = parsed.source;
  if (
    Object.entries(EXPECTED_SOURCE).some(
      ([key, expected]) => source[key] !== expected,
    )
  ) {
    throw new Error("item catalog does not match the pinned asset sources");
  }
  if (!isRecord(parsed.items)) throw new Error("item catalog has no item map");
  const stowable: unknown = JSON.parse(stowableContents);
  if (
    !isRecord(stowable) ||
    stowable.formatVersion !== 1 ||
    !isRecord(stowable.source) ||
    !Array.isArray(stowable.itemTypeIds)
  ) {
    throw new Error("stowable item types do not match the pinned Canary source");
  }
  const stowableSource = stowable.source;
  if (
    Object.entries(EXPECTED_STOWABLE_SOURCE).some(
      ([key, expected]) => stowableSource[key] !== expected,
    ) ||
    stowable.itemTypeIds.some(
      (id) => !Number.isInteger(id) || Number(id) < 1 || Number(id) > 65_535,
    ) ||
    new Set(stowable.itemTypeIds).size !== stowable.itemTypeIds.length
  ) {
    throw new Error("stowable item types do not match the pinned Canary source");
  }
  const stowableItemTypeIds = new Set<number>(stowable.itemTypeIds);
  return new ItemCatalog(
    Object.entries(parsed.items).map(([key, item]) => {
      const parsedItem = parseItem(item, key);
      return stowableItemTypeIds.has(parsedItem.id)
        ? { ...parsedItem, stowable: true }
        : parsedItem;
    }),
  );
}
