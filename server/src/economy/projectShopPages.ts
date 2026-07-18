import { PROTOCOL_LIMITS, type ShopEntryProjection } from "@tibia/protocol";
import type { Npc } from "../creature/Npc";
import type { ShopCurrencyProjection } from "./ShopCurrencyProjection";

/**
 * Splits the entries into pages that each fit in one shop-opened message;
 * null when any single entry is oversized or the page count overflows.
 */
export function projectShopPages(
  npc: Npc,
  shopId: string,
  shopSessionId: string,
  entries: ReadonlyArray<ShopEntryProjection>,
  currency: ShopCurrencyProjection,
): ShopEntryProjection[][] | null {
  const pages: ShopEntryProjection[][] = [];
  let current: ShopEntryProjection[] = [];
  for (const entry of entries) {
    const candidate = [...current, entry];
    const bytes = Buffer.byteLength(
      JSON.stringify({
        type: "shop-opened",
        npcId: npc.id,
        npcName: npc.name,
        shopId,
        shopSessionId,
        ...currency,
        page: 256,
        pageCount: 256,
        entries: candidate,
      }),
    );
    if (bytes <= PROTOCOL_LIMITS.maxMessageBytes) {
      current = candidate;
      continue;
    }
    if (current.length === 0) return null;
    pages.push(current);
    current = [entry];
    const singleEntryBytes = Buffer.byteLength(
      JSON.stringify({
        type: "shop-opened",
        npcId: npc.id,
        npcName: npc.name,
        shopId,
        shopSessionId,
        ...currency,
        page: 256,
        pageCount: 256,
        entries: current,
      }),
    );
    if (singleEntryBytes > PROTOCOL_LIMITS.maxMessageBytes) return null;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 && pages.length <= 256 ? pages : null;
}
