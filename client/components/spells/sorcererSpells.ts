import { SPELL_ARTWORK_BY_EFFECT } from "./spellArtwork";
import type { SpellListSpell } from "./spellTypes";

// Display metadata sourced from Canary commit a879c9312e34381e8eedf397b8ed44510698b689.
export const SORCERER_SPELLS = [
  {
    id: "attack-buzz",
    name: "Buzz",
    words: "exori infir vis",
    artwork: SPELL_ARTWORK_BY_EFFECT[38],
    requiredLevel: 1,
    manaCost: 6,
  },
  {
    id: "conjuring-light_stone_shower_rune",
    name: "Light Stone Shower Rune",
    words: "adori infir mas tera",
    artwork: SPELL_ARTWORK_BY_EFFECT[13],
    requiredLevel: 1,
    manaCost: 6,
  },
  {
    id: "conjuring-lightest_missile_rune",
    name: "Lightest Missile Rune",
    words: "adori infir vis",
    artwork: SPELL_ARTWORK_BY_EFFECT[13],
    requiredLevel: 1,
    manaCost: 6,
  },
  {
    id: "healing-magic_patch",
    name: "Magic Patch",
    words: "exura infir",
    artwork: SPELL_ARTWORK_BY_EFFECT[13],
    requiredLevel: 1,
    manaCost: 6,
  },
] as const satisfies ReadonlyArray<SpellListSpell>;
