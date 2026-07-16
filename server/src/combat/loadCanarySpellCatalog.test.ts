import { describe, expect, it } from "vitest";
import { spellCatalogEntrySchema } from "@tibia/protocol";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { evaluateSpellExpression } from "./evaluateSpellExpression";
import { loadCanarySpellCatalog } from "./loadCanarySpellCatalog";
import { SpellRegistry } from "./SpellRegistry";

describe("Canary spell catalog", () => {
  it("loads pinned direct spell and rune formulas", () => {
    const spells = loadCanarySpellCatalog();
    const buzz = spells.find((spell) => spell.name === "Buzz");
    const frontSweep = spells.find(
      (spell) => spell.name === "Lesser Front Sweep",
    );
    const suddenDeath = spells.find(
      (spell) => spell.name === "sudden death rune",
    );
    const haste = spells.find((spell) => spell.name === "Haste");
    const curse = spells.find((spell) => spell.name === "Curse");
    const energyBeam = spells.find((spell) => spell.name === "Energy Beam");

    expect(spells).toHaveLength(151);
    expect(buzz).toMatchObject({
      id: "exori-infir-vis",
      manaCost: 6,
      cooldownMs: 2_000,
      groupCooldownMs: [2_000],
      effectId: 38,
      missileId: 5,
    });
    expect(
      Math.floor(
        Math.abs(
          evaluateSpellExpression(buzz!.formula.minimum, {
            level: 1,
            magicLevel: 0,
            skill: 10,
            attack: 7,
          }),
        ),
      ),
    ).toBe(3);
    expect(
      Math.floor(
        Math.abs(
          evaluateSpellExpression(frontSweep!.formula.maximum, {
            level: 1,
            magicLevel: 0,
            skill: 10,
            attack: 7,
          }),
        ),
      ),
    ).toBe(18);
    expect(suddenDeath).toMatchObject({
      runeItemTypeId: 3155,
      requiredLevel: 45,
      requiredMagicLevel: 15,
    });
    expect(frontSweep?.area).toEqual({
      shape: "tiles",
      offsets: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      directional: true,
    });
    expect(haste?.condition).toEqual({
      type: "haste",
      durationMs: 30_000,
      speedFormula: { coefficient: 1.3, base: 40 },
    });
    expect(curse?.condition?.tickAmounts).toHaveLength(55);
    expect(curse?.condition).toMatchObject({
      type: "curse",
      durationMs: 165_000,
      tickIntervalMs: 3_000,
      damageType: "death",
    });
    expect(
      spells.find((spell) => spell.name === "Heal Friend")?.castRules,
    ).toEqual({
      targetPlayerOnly: true,
      allowSelf: false,
      excludedVocations: [],
      casterEffectId: 15,
    });
    expect(energyBeam).toMatchObject({
      damageType: "energy",
      effectId: 12,
      area: { shape: "beam", length: 5 },
    });
    expect(
      Math.floor(
        evaluateSpellExpression(energyBeam!.formula.maximum, {
          level: 23,
          magicLevel: 10,
          skill: 10,
          attack: 7,
        }),
      ),
    ).toBe(53);
  });

  it("projects only the player's server-owned instant spell metadata", () => {
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000103"),
      { x: 1, y: 1, z: 7 },
      0,
    );
    const projected = new SpellRegistry().projectFor(player);

    expect(projected.some((spell) => spell.name === "Bruise Bane")).toBe(true);
    expect(projected.some((spell) => spell.name === "Buzz")).toBe(false);
    expect(
      projected.some(
        (spell) =>
          spell.origin === "rune" &&
          spell.runeItemTypeId === 3155,
      ),
    ).toBe(true);
    expect(
      projected.every(
        (spell) => spellCatalogEntrySchema.safeParse(spell).success,
      ),
    ).toBe(true);
  });
});
