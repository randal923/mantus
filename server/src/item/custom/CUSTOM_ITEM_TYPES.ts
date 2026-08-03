import { CUSTOM_EXERCISE_TIERS } from "../../action/CUSTOM_EXERCISE_TIERS";
import { EXERCISE_WEAPON_FAMILIES } from "../../action/EXERCISE_WEAPON_FAMILIES";
import type { CustomItemType } from "./CustomItemType";

/**
 * Item types this server adds to the generated Canary catalog.
 *
 * Today that is the epic and legendary exercise weapons, one per family per
 * tier. Each copies its family's lasting tier — same weight, same reach, same
 * sprite — and changes only the identity a player sees: the name, the charge
 * count, and the tooltip line explaining the pace.
 */
export const CUSTOM_ITEM_TYPES: ReadonlyArray<CustomItemType> =
  EXERCISE_WEAPON_FAMILIES.flatMap((family) =>
    CUSTOM_EXERCISE_TIERS.map((tier) => ({
      id: family[tier.idKey],
      baseTypeId: family.canaryIds[3],
      name: `${tier.slug} exercise ${family.noun.toLowerCase()}`,
      article: tier.article,
      charges: tier.charges,
      description: tier.description,
    })),
  );
