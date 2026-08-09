import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";
import { CUSTOM_EXERCISE_TIERS } from "../../action/CUSTOM_EXERCISE_TIERS";
import { EXERCISE_WEAPON_FAMILIES } from "../../action/EXERCISE_WEAPON_FAMILIES";
import type { CustomItemType } from "./CustomItemType";

/**
 * Item types this server adds to the generated Canary catalog: the epic and
 * legendary exercise weapons (one per family per tier, copying the lasting
 * tier and changing only the visible identity), and the Portable Seller.
 */
export const CUSTOM_ITEM_TYPES: ReadonlyArray<CustomItemType> = [
  ...EXERCISE_WEAPON_FAMILIES.flatMap((family) =>
    CUSTOM_EXERCISE_TIERS.map((tier) => ({
      id: family[tier.idKey],
      baseTypeId: family.canaryIds[3],
      name: `${tier.slug} exercise ${family.noun.toLowerCase()}`,
      article: tier.article,
      charges: tier.charges,
      description: tier.description,
    })),
  ),
  {
    id: PORTABLE_SELLER_TYPE_ID,
    baseTypeId: 2_906,
    name: "portable seller",
    article: "a",
    description:
      "A magical vendor that sells everything inside your loot pouch for " +
      "gold, paid straight into your bank account. It triggers on its own " +
      "every 10 minutes; use it to trigger a sale at most once per minute.",
    movable: false,
  },
];
