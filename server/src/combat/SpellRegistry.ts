import type { SpellCatalogEntry } from "@tibia/protocol";
import type { Player } from "../Player";
import { loadCanarySpellCatalog } from "./loadCanarySpellCatalog";
import type { SpellDefinition } from "./Spell";
import { spellParameterKind } from "./spellParameterKind";

const normalizeSpellWords = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

export class SpellRegistry {
  private readonly spells = loadCanarySpellCatalog();
  private readonly byId = new Map(
    this.spells.map((spell) => [spell.id, spell]),
  );
  private readonly byRuneTypeId = new Map(
    this.spells.flatMap((spell) =>
      spell.runeItemTypeId
        ? [[spell.runeItemTypeId, spell] as const]
        : [],
    ),
  );
  private readonly byWords = new Map(
    this.spells.flatMap((spell) =>
      spell.words && spell.origin === "spell"
        ? [[normalizeSpellWords(spell.words), spell] as const]
        : [],
    ),
  );
  private readonly conjuringByRuneTypeId = new Map(
    this.spells.flatMap((spell) =>
      spell.origin === "spell" && spell.conjure
        ? [[spell.conjure.targetItemTypeId, spell] as const]
        : [],
    ),
  );

  get(spellId: string): SpellDefinition | undefined {
    return this.byId.get(spellId);
  }

  getRune(itemTypeId: number): SpellDefinition | undefined {
    return this.byRuneTypeId.get(itemTypeId);
  }

  /** The instant spell that conjures this rune, for Runic Mastery. */
  conjuringSpellFor(runeItemTypeId: number): SpellDefinition | undefined {
    return this.conjuringByRuneTypeId.get(runeItemTypeId);
  }

  /**
   * Matches spoken text to a spell, Tibia-style: an exact words match, or
   * the longest words prefix followed by a parameter ('exani hur "up"').
   */
  matchWords(
    text: string,
  ): { spell: SpellDefinition; parameter: string | null } | undefined {
    const normalized = normalizeSpellWords(text);
    const exact = this.byWords.get(normalized);
    if (exact) return { spell: exact, parameter: null };
    for (
      let end = normalized.lastIndexOf(" ");
      end > 0;
      end = normalized.lastIndexOf(" ", end - 1)
    ) {
      const spell = this.byWords.get(normalized.slice(0, end));
      if (!spell) continue;
      const parameter = normalized
        .slice(end + 1)
        .replace(/^"/, "")
        .replace(/"$/, "")
        .trim();
      return { spell, parameter: parameter.length > 0 ? parameter : null };
    }
    return undefined;
  }

  projectFor(player: Player): SpellCatalogEntry[] {
    return this.spells
      .filter((spell) => spell.vocations.includes(player.vocation))
      .map((spell) => ({
        id: spell.id,
        origin: spell.origin,
        runeItemTypeId: spell.runeItemTypeId,
        name: spell.name,
        words: spell.words,
        damageType: spell.damageType,
        effectId: spell.effectId,
        manaCost: spell.manaCost,
        soulCost: spell.soulCost,
        requiredLevel: spell.requiredLevel,
        requiredMagicLevel: spell.requiredMagicLevel,
        needWeapon: spell.needWeapon,
        cooldownMs: spell.cooldownMs,
        cooldownGroups: [
          `spell:${spell.id}`,
          ...spell.groups.map((group) => `group:${group}`),
        ],
        targetKind: spell.targetKind,
        parameterKind: spellParameterKind(spell),
      }))
      .sort(
        (left, right) =>
          left.requiredLevel - right.requiredLevel ||
          left.name.localeCompare(right.name),
      );
  }
}
