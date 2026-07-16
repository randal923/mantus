import type { CharacterVocation } from "@tibia/protocol";
import { DRUID_SPELLS } from "./druidSpells";
import { KNIGHT_SPELLS } from "./knightSpells";
import { PALADIN_SPELLS } from "./paladinSpells";
import { SORCERER_SPELLS } from "./sorcererSpells";
import type { SpellListSpell } from "./spellTypes";

export const SPELL_LISTS = {
  Knight: KNIGHT_SPELLS,
  "Elite Knight": KNIGHT_SPELLS,
  Paladin: PALADIN_SPELLS,
  "Royal Paladin": PALADIN_SPELLS,
  Sorcerer: SORCERER_SPELLS,
  "Master Sorcerer": SORCERER_SPELLS,
  Druid: DRUID_SPELLS,
  "Elder Druid": DRUID_SPELLS,
} as const satisfies Readonly<
  Record<CharacterVocation, ReadonlyArray<SpellListSpell>>
>;
