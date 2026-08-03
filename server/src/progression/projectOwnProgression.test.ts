import { ownProgressionStateSchema } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { projectOwnProgression } from "./projectOwnProgression";

describe("projectOwnProgression", () => {
  it("projects exact status only through the own-player shape", () => {
    const player = new Player(
      makeCharacter("hero", "Hero"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    const own = projectOwnProgression(player, 0);
    const visible = player.toState();

    expect(ownProgressionStateSchema.safeParse(own).success).toBe(true);
    expect(own).toMatchObject({
      level: 1,
      experience: "0",
      health: 150,
      maxHealth: 150,
      mana: 55,
      maxMana: 55,
      capacity: 400,
      magicLevel: 0,
      soul: 100,
    });
    expect(visible).not.toHaveProperty("experience");
    expect(visible).not.toHaveProperty("skills");
    expect(visible).not.toHaveProperty("magicLevel");
    expect(visible).not.toHaveProperty("vocation");
  });

  it("breaks equipment bonuses out of the effective skill and stat values", () => {
    const player = new Player(
      makeCharacter("hero", "Hero"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    const baseSpeed = player.progression.speed;

    player.progression.setEquipmentSkillBonuses({
      skills: { sword: 5 },
      magicLevel: 2,
    });
    player.progression.setEquipmentModifier({ speed: 20 });
    const own = projectOwnProgression(player, 0);

    expect(ownProgressionStateSchema.safeParse(own).success).toBe(true);
    expect(own.equipmentBonuses).toMatchObject({ magicLevel: 2, speed: 20 });
    expect(own.speed).toBe(baseSpeed + 20);
    // The effective value carries the bonus; the base skill level does not.
    const sword = own.skills.find((skill) => skill.skill === "sword");
    expect(sword?.equipmentBonus).toBe(5);
    expect(sword?.boostedLevel).toBe(player.skillLevel("sword") + 5);
    expect(sword?.level).toBe(player.skillLevel("sword"));
    expect(own.boostedMagicLevel).toBe(player.boostedMagicLevel + 2);
    expect(own.magicLevel).toBe(player.boostedMagicLevel);
  });

  it("reports no equipment bonus for a character wearing nothing", () => {
    const player = new Player(
      makeCharacter("bare", "Bare"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    const own = projectOwnProgression(player, 0);

    expect(own.equipmentBonuses).toEqual({
      magicLevel: 0,
      maxHealth: 0,
      maxMana: 0,
      capacity: 0,
      speed: 0,
      attackSpeedMs: 0,
    });
    expect(
      own.skills.every((skill) => (skill.equipmentBonus ?? 0) === 0),
    ).toBe(true);
  });

  it("projects regeneration from the saved vocation instead of premium", () => {
    const player = new Player(
      { ...makeCharacter("mage"), vocation: "Sorcerer" },
      { x: 0, y: 0, z: 7 },
      0,
      new Date(24 * 60 * 60 * 1_000),
    );

    expect(projectOwnProgression(player, 0)).toMatchObject({
      healthRegeneration: { amount: 1, intervalMs: 12_000 },
      manaRegeneration: { amount: 2, intervalMs: 3_000 },
      soulRegeneration: { amount: 1, intervalMs: 120_000 },
    });

    player.promote("Master Sorcerer", 0);
    expect(projectOwnProgression(player, 0)).toMatchObject({
      healthRegeneration: { amount: 1, intervalMs: 12_000 },
      manaRegeneration: { amount: 2, intervalMs: 2_000 },
      soulRegeneration: { amount: 1, intervalMs: 15_000 },
    });
  });
});
