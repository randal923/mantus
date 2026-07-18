import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_VOCATIONS,
  type CharacterVocation,
} from "@tibia/protocol";
import type { ShopCatalog, ShopEntry } from "./ShopCatalog";
import type { ShopAvailabilityRule } from "./ShopAvailabilityRule";

const CONTENT_FILE = fileURLToPath(
  new URL("../../../content/npcs/canary-shops.json", import.meta.url),
);
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ENTRIES = 256;
const MAX_PRICE = 1_000_000_000;

export function loadShopCatalogs(
  expectedCanaryCommit: string,
): ReadonlyMap<string, ShopCatalog> {
  const document = record(
    JSON.parse(readFileSync(CONTENT_FILE, "utf8")),
    "shop catalog document",
  );
  if (document.formatVersion !== 2) {
    throw new Error("shop catalog content has an unsupported version");
  }
  const source = record(document.source, "shop catalog source");
  if (source.canaryCommit !== expectedCanaryCommit) {
    throw new Error("shop catalog content does not match creature content");
  }
  if (!Array.isArray(document.shops) || document.shops.length === 0) {
    throw new Error("shop catalog definitions must be a non-empty array");
  }
  const catalogs = new Map<string, ShopCatalog>();
  for (const value of document.shops) {
    const shop = record(value, "shop catalog");
    const id = identifier(shop.id, "shop id");
    if (catalogs.has(id)) throw new Error(`duplicate shop catalog ${id}`);
    if (!Array.isArray(shop.excluded)) {
      throw new Error(`shop ${id} exclusions must be an array`);
    }
    shop.excluded.forEach((value) => parseExclusion(value, id));
    const currencyItemTypeId = optionalInteger(
      shop.currencyItemTypeId,
      "shop currency item type",
      1,
      65_535,
    );
    const currencyName = shop.currencyName === undefined
      ? undefined
      : text(shop.currencyName, "shop currency name");
    if ((currencyItemTypeId === undefined) !== (currencyName === undefined)) {
      throw new Error(`shop ${id} currency is incomplete`);
    }
    catalogs.set(id, {
      id,
      npcTypeId: identifier(shop.npcTypeId, "shop NPC type id"),
      ...(currencyItemTypeId === undefined
        ? {}
        : { currencyItemTypeId, currencyName }),
      entries: parseEntries(shop.entries, id),
    });
  }
  return catalogs;
}

function parseEntries(value: unknown, shopId: string): ShopEntry[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRIES) {
    throw new Error(`shop ${shopId} entries must contain 1-${MAX_ENTRIES} items`);
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    const row = record(entry, "shop entry");
    const offerId = identifier(row.offerId, "shop offer id");
    const itemTypeId = integer(row.itemTypeId, "shop entry item type", 1, 65_535);
    if (seen.has(offerId)) {
      throw new Error(`shop ${shopId} lists offer ${offerId} more than once`);
    }
    seen.add(offerId);
    const buyPrice =
      row.buyPrice === undefined
        ? undefined
        : integer(row.buyPrice, "shop entry buy price", 0, MAX_PRICE);
    const sellPrice =
      row.sellPrice === undefined
        ? undefined
        : integer(row.sellPrice, "shop entry sell price", 0, MAX_PRICE);
    if (buyPrice === undefined && sellPrice === undefined) {
      throw new Error(`shop ${shopId} item ${itemTypeId} has no price`);
    }
    const minimumAmount = integer(
      row.minimumAmount,
      "shop entry minimum amount",
      1,
      100,
    );
    const maximumAmount = integer(
      row.maximumAmount,
      "shop entry maximum amount",
      minimumAmount,
      100,
    );
    const subtype = optionalInteger(
      row.subtype,
      "shop entry subtype",
      1,
      65_535,
    );
    const stock = optionalInteger(row.stock, "shop entry stock", 1, 1_000_000_000);
    const minimumLevel = optionalInteger(
      row.minimumLevel,
      "shop entry minimum level",
      1,
      10_000,
    );
    const vocations = parseVocations(row.vocations);
    const availability = parseAvailability(row.availability);
    return {
      offerId,
      itemTypeId,
      name: text(row.name, "shop entry name"),
      minimumAmount,
      maximumAmount,
      ...(subtype === undefined ? {} : { subtype }),
      ...(stock === undefined ? {} : { stock }),
      ...(minimumLevel === undefined ? {} : { minimumLevel }),
      ...(vocations === undefined ? {} : { vocations }),
      ...(availability === undefined ? {} : { availability }),
      ...(buyPrice === undefined ? {} : { buyPrice }),
      ...(sellPrice === undefined ? {} : { sellPrice }),
    };
  });
}

function parseAvailability(
  value: unknown,
): ShopAvailabilityRule[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new Error("shop entry availability is invalid");
  }
  return value.map((entry) => {
    const rule = record(entry, "shop availability rule");
    if (rule.kind !== "storage-at-least") {
      throw new Error("shop availability rule is unsupported");
    }
    return {
      kind: "storage-at-least",
      key: text(rule.key, "shop storage key", 192),
      value: integer(
        rule.value,
        "shop storage value",
        -2_147_483_648,
        2_147_483_647,
      ),
    };
  });
}

function parseExclusion(value: unknown, shopId: string): void {
  const exclusion = record(value, "shop exclusion");
  integer(exclusion.line, "shop exclusion line", 1, 1_000_000);
  text(exclusion.reason, "shop exclusion reason");
  if (exclusion.itemTypeId !== undefined) {
    integer(exclusion.itemTypeId, "shop excluded item type", 1, 65_535);
  }
  if (Object.keys(exclusion).some((key) => !["line", "reason", "itemTypeId"].includes(key))) {
    throw new Error(`shop ${shopId} exclusion contains unknown fields`);
  }
}

function parseVocations(value: unknown): CharacterVocation[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new Error("shop entry vocations are invalid");
  }
  const known = new Set<string>(CHARACTER_VOCATIONS);
  const parsed = value.map((entry) => {
    if (typeof entry !== "string" || !known.has(entry)) {
      throw new Error("shop entry vocation is invalid");
    }
    return entry as CharacterVocation;
  });
  if (new Set(parsed).size !== parsed.length) {
    throw new Error("shop entry vocations contain duplicates");
  }
  return parsed;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!IDENTIFIER.test(parsed) || parsed.length > 64) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function text(value: unknown, label: string, maximum = 120): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} is out of range`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  return value === undefined
    ? undefined
    : integer(value, label, minimum, maximum);
}
