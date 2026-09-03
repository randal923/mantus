import { TEMPLE_TELEPORT_SCROLL_TYPE_ID } from "../item/templeTeleportScrollTypeId";
import type { StoreCatalogProduct } from "./storeCatalog";

/**
 * Canary sells "Temple Teleport" as an instant service (OFFER_TYPE_TEMPLE):
 * buying it moves the character on the spot. This server sells the temple
 * teleport scroll instead — the item Canary hands out as a daily reward —
 * so the trip is an inventory item the player uses when they choose,
 * refused while in a fight (TempleTeleportScrollService). The importer skips
 * Canary's service offer; this hand-authored product takes its place in the
 * useful-things category (storeCatalog.ts). The sub-offer id is the one the
 * service offer used, so purchase history keeps resolving.
 */
export const TEMPLE_TELEPORT_SCROLL_PRODUCT: StoreCatalogProduct = {
  id: "useful-things-temple-teleport",
  name: "Temple Teleport Scroll",
  kind: "item",
  description: {
    en:
      "A scroll that teleports you straight to your home temple.\n\n" +
      "{character}\n" +
      "{useicon} use it to teleport to your home temple; the scroll is consumed\n" +
      "{battlesign}\n" +
      "{info} cannot be used while you are in a fight",
    "pt-BR":
      "Um pergaminho que teleporta você direto para o seu templo de origem.\n\n" +
      "{character}\n" +
      "{useicon} use-o para se teleportar ao seu templo de origem; o pergaminho é consumido\n" +
      "{battlesign}\n" +
      "{info} não pode ser usado enquanto você estiver em combate",
  },
  icon: { kind: "item", itemTypeId: TEMPLE_TELEPORT_SCROLL_TYPE_ID },
  subOffers: [
    {
      id: "temple-teleport",
      price: 15,
      count: 1,
      grant: {
        kind: "item",
        itemTypeId: TEMPLE_TELEPORT_SCROLL_TYPE_ID,
        count: 1,
        unique: false,
      },
    },
  ],
};
