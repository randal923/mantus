import type { Npc } from "../creature/Npc";

export function npcOwnsShop(npc: Npc, shopId: string): boolean {
  return Boolean(
    npc.type.dialogue?.nodes.some(
      (node) => node.action?.kind === "shop" && node.action.shopId === shopId,
    ),
  );
}
