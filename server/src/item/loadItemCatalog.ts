import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EQUIPMENT_SLOTS } from "@tibia/protocol";
import { ItemCatalog } from "./ItemCatalog";
import type { ItemType } from "./ItemType";

const CATALOG_PATH = fileURLToPath(
  new URL("../../data/item-catalog.json", import.meta.url),
);
const EXPECTED_SOURCE = {
  assetEra: "Tibia 15.11 extended",
  canaryCommit: "a879c9312e34381e8eedf397b8ed44510698b689",
  canaryItemsSha256:
    "f7f60d81a7b7b613b32328b0cd921cb222b45ec49d31b0d01af6a67a74a687ed",
  datSha256: "e25fadcf0cd9140cff8c89fa94026438d7c42322c6e23a71b1da5471a317b057",
  sprSha256: "a7085447ddaa340ada42bfa71aed5f41582b1cd368f4a781b0464594f3c9b9ee",
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
  const parsed: unknown = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  if (!isRecord(parsed) || parsed.formatVersion !== 1) {
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
  return new ItemCatalog(
    Object.entries(parsed.items).map(([key, item]) => parseItem(item, key)),
  );
}
