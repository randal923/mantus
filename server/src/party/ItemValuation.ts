import type { ItemCatalog } from "../item/ItemCatalog";
import type { ShopCatalog } from "../economy/ShopCatalog";

export type PartyAnalyzerPriceMode = "market" | "npc";

/**
 * Values the analyzer's loot and supplies. Two sources, chosen by the party
 * leader's price mode:
 *
 *  * "npc"    — the best price an NPC in the pinned shop catalogs pays for the
 *               item; 0 when no NPC buys it.
 *  * "market" — the item type's catalog `worth`, its intrinsic gold value.
 *
 * Canary's market mode reads live market statistics; ours uses catalog worth
 * until a market price index exists. Both sources are server-side content, so
 * neither can be influenced by a client.
 */
export class ItemValuation {
  private readonly npcSellPrices = new Map<number, number>();

  constructor(
    private readonly catalog: ItemCatalog,
    shopCatalogs: ReadonlyMap<string, ShopCatalog>,
  ) {
    for (const shop of shopCatalogs.values()) {
      // Coin-denominated shops only: a shop paying in tokens would otherwise
      // report its token price as if it were gold.
      if (shop.currencyItemTypeId !== undefined) continue;
      for (const entry of shop.entries) {
        if (entry.sellPrice === undefined) continue;
        const best = this.npcSellPrices.get(entry.itemTypeId) ?? 0;
        if (entry.sellPrice > best) {
          this.npcSellPrices.set(entry.itemTypeId, entry.sellPrice);
        }
      }
    }
  }

  unitValue(typeId: number, mode: PartyAnalyzerPriceMode): number {
    if (mode === "npc") return this.npcSellPrices.get(typeId) ?? 0;
    return this.catalog.get(typeId)?.worth ?? 0;
  }

  totalValue(
    counts: ReadonlyMap<number, number>,
    mode: PartyAnalyzerPriceMode,
  ): number {
    let total = 0;
    for (const [typeId, count] of counts) {
      total += this.unitValue(typeId, mode) * count;
    }
    return total;
  }
}
