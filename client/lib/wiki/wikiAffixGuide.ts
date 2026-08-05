import type { ItemRarity } from "@tibia/protocol";

export interface WikiAffixGuideEntry {
  readonly id: string;
  /** English game term, matching the server's rolled-affix tooltip text. */
  readonly name: string;
  /** Base roll band at uncommon; higher grades scale it by the multiplier. */
  readonly minimum: number;
  readonly maximum: number;
  readonly percent: boolean;
  /** Lowest grade whose pool includes this affix; absent = any. */
  readonly minimumRarity?: ItemRarity;
  /** Key under `websiteWikiItems.affixes.notes` for a caveat worth showing. */
  readonly noteKey?: string;
}

/**
 * Mirrors the server tuning in `server/src/rarity/affixDefinitions.ts` and
 * the `rarity.affixes` block of `config.yml`; update together when the
 * tuning changes.
 */
export const WIKI_AFFIX_GUIDE: ReadonlyArray<WikiAffixGuideEntry> = [
  { id: "maxHealth", name: "Maximum Health", minimum: 15, maximum: 40, percent: false },
  { id: "maxMana", name: "Maximum Mana", minimum: 20, maximum: 50, percent: false },
  { id: "attackSpeed", name: "Attack Speed", minimum: 3, maximum: 8, percent: true, noteKey: "attackSpeed" },
  { id: "attack", name: "Attack", minimum: 1, maximum: 4, percent: false },
  { id: "defense", name: "Defense", minimum: 1, maximum: 4, percent: false },
  { id: "lifeLeech", name: "Life Leech", minimum: 1, maximum: 3, percent: true, noteKey: "lifeLeech" },
  { id: "manaLeech", name: "Mana Leech", minimum: 1, maximum: 2, percent: true, noteKey: "manaLeech" },
  { id: "critChance", name: "Critical Hit Chance", minimum: 1, maximum: 3, percent: true },
  { id: "critDamage", name: "Critical Extra Damage", minimum: 5, maximum: 15, percent: true },
  { id: "skill", name: "Weapon Skill", minimum: 1, maximum: 2, percent: false, noteKey: "skill" },
  { id: "magicLevel", name: "Magic Level", minimum: 1, maximum: 1, percent: false, minimumRarity: "rare", noteKey: "magicLevel" },
  { id: "resistance", name: "Elemental Resistance", minimum: 3, maximum: 8, percent: true, noteKey: "resistance" },
];
