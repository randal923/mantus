import type { DamageType, ItemRarity } from "@tibia/protocol";

export const AFFIX_IDS = [
  "maxHealth",
  "maxMana",
  "attackSpeed",
  "attack",
  "defense",
  "lifeLeech",
  "manaLeech",
  "critChance",
  "critDamage",
  "skill",
  "magicLevel",
  "resistance",
] as const;

export type AffixId = (typeof AFFIX_IDS)[number];

/** Elements a resistance affix can roll; drains/drown/healing stay out. */
export const AFFIX_ELEMENTS = [
  "physical",
  "energy",
  "earth",
  "fire",
  "ice",
  "holy",
  "death",
] as const satisfies ReadonlyArray<DamageType>;

export type AffixElement = (typeof AFFIX_ELEMENTS)[number];

/** Skills a skill affix can roll; picked to match the item at roll time. */
export const AFFIX_SKILLS = [
  "sword",
  "axe",
  "club",
  "distance",
  "shielding",
] as const;

export type AffixSkill = (typeof AFFIX_SKILLS)[number];

/**
 * One rolled bonus stored in the item's attribute bag. Only ids and numbers
 * are persisted — display text is derived from the static affix table at
 * projection time, unlike imbuements, which must denormalize their labels.
 */
export interface RolledAffix {
  readonly id: AffixId;
  readonly value: number;
  /** Present only when `id` is `resistance`. */
  readonly element?: AffixElement;
  /** Present only when `id` is `skill`. */
  readonly skill?: AffixSkill;
}

export interface ItemRarityState {
  readonly rarity: ItemRarity;
  readonly affixes: ReadonlyArray<RolledAffix>;
}
