import { SPELL_ARTWORK_BY_EFFECT } from "./spellArtwork";
import type { SpellListSpell } from "./spellTypes";

// Display metadata sourced from Canary commit a879c9312e34381e8eedf397b8ed44510698b689.
export const PALADIN_SPELLS = [
  {
    id: "conjuring-arrow_call",
    name: "Arrow Call",
    words: "exevo infir con",
    artwork: SPELL_ARTWORK_BY_EFFECT[13],
    requiredLevel: 1,
    manaCost: 10,
  },
  {
    id: "attack-lesser_ethereal_spear",
    name: "Lesser Ethereal Spear",
    words: "exori infir con",
    artwork: SPELL_ARTWORK_BY_EFFECT[10],
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
  {
    id: "support-find_person",
    name: "Find Person",
    words: "exiva",
    artwork: SPELL_ARTWORK_BY_EFFECT[13],
    requiredLevel: 8,
    manaCost: 20,
  },
] as const satisfies ReadonlyArray<SpellListSpell>;
