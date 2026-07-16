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
