import { CHARACTER_VOCATIONS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { deriveCharacterStats } from "./deriveCharacterStats";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getLevelForExperience } from "./getLevelForExperience";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";

describe("progression curves", () => {
  it("keeps experience boundaries deterministic", () => {
    expect(getExperienceForLevel(1)).toBe(0);
    expect(getExperienceForLevel(2)).toBe(100);
    expect(getExperienceForLevel(8)).toBe(4_200);
    expect(getLevelForExperience(99)).toBe(1);
    expect(getLevelForExperience(100)).toBe(2);
    expect(getLevelForExperience(4_199)).toBe(7);
    expect(getLevelForExperience(4_200)).toBe(8);
  });

  it("uses vocation-specific skill and magic curves", () => {
    expect(
      getSkillTriesForNextLevel(getVocation("Knight"), "sword", 10),
    ).toBe(50);
    expect(
      getSkillTriesForNextLevel(getVocation("Knight"), "sword", 11),
    ).toBe(55);
    expect(
      getSkillTriesForNextLevel(getVocation("Paladin"), "distance", 10),
    ).toBe(30);
    expect(getManaForNextMagicLevel(getVocation("Sorcerer"), 0)).toBe(1_600);
    expect(getManaForNextMagicLevel(getVocation("Sorcerer"), 1)).toBe(1_760);
  });

  it("matches every pinned vocation coefficient, including Monk promotions", () => {
    expect(CHARACTER_VOCATIONS).toHaveLength(10);
    expect(getVocation("Monk")).toMatchObject({
      numericId: 9,
      promotedVocation: "Exalted Monk",
      gains: { health: 10, mana: 10, capacity: 25 },
      regeneration: {
        healthIntervalMs: 6_000,
        healthAmount: 1,
        manaIntervalMs: 6_000,
        manaAmount: 2,
        soulIntervalMs: 120_000,
        soulAmount: 1,
      },
      magicProgressionMultiplier: 1.3,
      skillProgressionMultipliers: {
        fist: 1.1,
        club: 1.5,
        sword: 1.5,
        axe: 1.5,
        distance: 2,
        shielding: 1.2,
        fishing: 1.1,
      },
      formulas: {
        mitigation: 1.28,
        primaryShield: 2.08,
        secondaryShield: 1.2,
      },
    });
    expect(getVocation("Exalted Monk")).toMatchObject({
      numericId: 10,
      promotedFrom: "Monk",
      maxSoul: 200,
      regeneration: {
        healthIntervalMs: 4_000,
        manaIntervalMs: 6_000,
        soulIntervalMs: 15_000,
      },
    });
    expect(
      getSkillTriesForNextLevel(getVocation("Monk"), "fist", 11),
    ).toBe(55);
    expect(getManaForNextMagicLevel(getVocation("Monk"), 1)).toBe(2_080);
  });

  it("derives totals from vocation, level, equipment, and conditions", () => {
    expect(
      deriveCharacterStats({
        vocation: "Knight",
        definitionVersion: 1,
        level: 5,
        equipment: [{ maxHealth: 20, capacity: 10 }],
        conditions: [{ maxHealth: -5, maxMana: 7, speed: 15 }],
      }),
    ).toEqual({
      maxHealth: 225,
      maxMana: 82,
      capacity: 510,
      speed: 129,
    });
  });
});
