import { CUSTOM_EXERCISE_TIERS } from "../action/CUSTOM_EXERCISE_TIERS";
import { EXERCISE_WEAPON_FAMILIES } from "../action/EXERCISE_WEAPON_FAMILIES";
import type { StoreCatalogCategory } from "./storeCatalog";

/** Canary iconed this shelf with a weapon; the epic sword takes that place. */
const SWORD = EXERCISE_WEAPON_FAMILIES.find(
  (family) => family.noun === "Sword",
);
if (!SWORD) throw new Error("the exercise-weapon families have no sword");

/**
 * The store's Exercise Weapons shelf, replacing the one imported from Canary.
 *
 * Canary sells its exercise, durable and lasting tiers here for gold-priced
 * coin bundles. This server does not: those three stay in the world — NPCs,
 * daily rewards, quests — and the shelf stocks only the two tiers that exist
 * nowhere else, the epic and legendary weapons that train five times as fast.
 * That keeps the Mantus Store the sole source of the fast tiers without
 * removing any way a player already had to train.
 *
 * The descriptions use the official client's tag markup, the same as every
 * imported offer, so they render identically in the detail pane.
 */
export const EXERCISE_WEAPON_CATEGORY: StoreCatalogCategory = {
  id: "exercise-weapons",
  name: "Exercise Weapons",
  parentId: "consumables",
  icon: { kind: "item", itemTypeId: SWORD.epicId },
  products: CUSTOM_EXERCISE_TIERS.flatMap((tier) =>
    EXERCISE_WEAPON_FAMILIES.map((family) => {
      const itemTypeId = family[tier.idKey];
      return {
        id: `exercise-weapons-${tier.slug}-exercise-${family.noun.toLowerCase()}`,
        name: `${tier.label} Exercise ${family.noun}`,
        kind: "charges" as const,
        description:
          `Use it to train ${family.trains} on an exercise dummy!\n\n` +
          "{character}\n{storeinbox}\n" +
          `{info} use it on an exercise dummy to train ${family.trains}\n` +
          `{info} trains ${tier.speedMultiplier}x as fast as an ordinary exercise weapon\n` +
          `{info} usable ${tier.charges} times a piece`,
        icon: { kind: "item" as const, itemTypeId },
        subOffers: [
          {
            id: `charges-${itemTypeId}-${tier.charges}`,
            price: tier.price,
            grant: {
              kind: "charges" as const,
              itemTypeId,
              charges: tier.charges,
            },
          },
        ],
      };
    }),
  ),
};
