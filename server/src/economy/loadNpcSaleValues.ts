import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CONTENT_FILE = fileURLToPath(
  new URL("../../../content/npcs/canary-shops.json", import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Best gold price an NPC pays the player per item type, for display (the
 * tooltip's gold-value row). Read best-effort from the pinned shop content:
 * shops trading a custom currency are skipped, and `loadShopCatalogs` remains
 * the strict loader that actually drives trade.
 */
export async function loadNpcSaleValues(): Promise<ReadonlyMap<number, number>> {
  const document: unknown = JSON.parse(await readFile(CONTENT_FILE, "utf8"));
  if (!isRecord(document) || !Array.isArray(document.shops)) {
    throw new Error("shop catalog content has no shops array");
  }
  const values = new Map<number, number>();
  for (const shop of document.shops) {
    if (!isRecord(shop) || shop.currencyItemTypeId !== undefined) continue;
    if (!Array.isArray(shop.entries)) continue;
    for (const entry of shop.entries) {
      if (!isRecord(entry)) continue;
      const { itemTypeId, sellPrice } = entry;
      if (typeof itemTypeId !== "number" || !Number.isInteger(itemTypeId)) {
        continue;
      }
      if (typeof sellPrice !== "number" || sellPrice <= 0) continue;
      const known = values.get(itemTypeId);
      if (known === undefined || sellPrice > known) {
        values.set(itemTypeId, sellPrice);
      }
    }
  }
  return values;
}
