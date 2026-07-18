import type { CharacterVocation } from "@tibia/protocol";
import type { ShopAvailabilityRule } from "./ShopAvailabilityRule";

export interface ShopEntry {
  readonly offerId: string;
  readonly itemTypeId: number;
  readonly name: string;
  readonly minimumAmount: number;
  readonly maximumAmount: number;
  readonly subtype?: number;
  readonly stock?: number;
  readonly minimumLevel?: number;
  readonly vocations?: ReadonlyArray<CharacterVocation>;
  readonly availability?: ReadonlyArray<ShopAvailabilityRule>;
  /** Price the player pays to buy one unit from the NPC. */
  readonly buyPrice?: number;
  /** Price the NPC pays the player for one unit. */
  readonly sellPrice?: number;
}

export interface ShopCatalog {
  readonly id: string;
  readonly npcTypeId: string;
  readonly currencyItemTypeId?: number;
  readonly currencyName?: string;
  readonly entries: ReadonlyArray<ShopEntry>;
}
