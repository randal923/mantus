import { EQUIPMENT_SLOTS } from "@tibia/protocol";
import type { WikiItem } from "./WikiItem";

const MAX_WIKI_ITEMS = 10_000;
const OPTIONAL_STRING_FIELDS = [
  "description",
  "primaryType",
  "weaponType",
  "wandType",
] as const;
const OPTIONAL_NUMBER_FIELDS = [
  "attack",
  "defense",
  "extraDefense",
  "armor",
  "range",
  "hitChance",
  "manaCost",
  "minimumDamage",
  "maximumDamage",
  "imbuementSlots",
  "containerCapacity",
  "charges",
  "speed",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRequirements(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.level !== undefined &&
    (!Number.isInteger(value.level) || Number(value.level) < 0)
  ) {
    return false;
  }
  if (value.vocations === undefined) return true;
  return (
    Array.isArray(value.vocations) &&
    value.vocations.length <= 20 &&
    value.vocations.every(
      (vocation) =>
        typeof vocation === "string" &&
        vocation.length > 0 &&
        vocation.length <= 50,
    )
  );
}

function isWikiItem(value: unknown): value is WikiItem {
  if (!isRecord(value)) return false;
  if (
    !Number.isInteger(value.id) ||
    Number(value.id) < 1 ||
    Number(value.id) > 65_535 ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 100 ||
    !Number.isInteger(value.spriteId) ||
    Number(value.spriteId) < 1 ||
    !Number.isInteger(value.weight) ||
    Number(value.weight) < 0
  ) {
    return false;
  }
  if (
    OPTIONAL_STRING_FIELDS.some(
      (field) =>
        value[field] !== undefined &&
        (typeof value[field] !== "string" || String(value[field]).length > 1000),
    )
  ) {
    return false;
  }
  if (
    OPTIONAL_NUMBER_FIELDS.some(
      (field) => value[field] !== undefined && !Number.isFinite(value[field]),
    )
  ) {
    return false;
  }
  if (
    value.equipmentSlot !== undefined &&
    !EQUIPMENT_SLOTS.includes(
      value.equipmentSlot as (typeof EQUIPMENT_SLOTS)[number],
    )
  ) {
    return false;
  }
  return value.requirements === undefined || isRequirements(value.requirements);
}

export function parseWikiItemCatalog(value: unknown): ReadonlyArray<WikiItem> {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_WIKI_ITEMS ||
    !value.items.every(isWikiItem)
  ) {
    throw new Error("invalid wiki item catalog");
  }
  return value.items;
}
