import type { SpellCatalogEntry } from "@tibia/protocol";
import type { Player } from "../Player";
import { loadCanarySpellCatalog } from "./loadCanarySpellCatalog";
import type { SpellDefinition } from "./Spell";

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

  get(spellId: string): SpellDefinition | undefined {
    return this.byId.get(spellId);
  }

  getRune(itemTypeId: number): SpellDefinition | undefined {
    return this.byRuneTypeId.get(itemTypeId);
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
      }))
      .sort(
        (left, right) =>
          left.requiredLevel - right.requiredLevel ||
          left.name.localeCompare(right.name),
      );
  }
}
