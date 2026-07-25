import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { getExperienceForLevel } from "./getExperienceForLevel";

const POSITION = { x: 0, y: 0, z: 7 };

function makeVeteran(id: string): Player {
  const player = new Player(makeCharacter(id), POSITION, 0);
  // Below level 25 the loss is the flat tenth, so the drain is large enough
  // to cost a skill level outright.
  player.awardExperience(`${id}:exp`, getExperienceForLevel(20));
  player.awardSkillTries(`${id}:sword`, "sword", 20_000);
  player.awardMagicProgress(`${id}:magic`, 40_000);
  return player;
}

function skillLevel(player: Player, skill: "sword"): number {
  const state = player.progression.skills.find(
    (entry) => entry.skill === skill,
  );
  if (!state) throw new Error("missing skill");
  return state.level;
}

describe("player death penalty", () => {
  it("charges experience, magic level, and skills from one death event", () => {
    const player = makeVeteran("veteran");
    const experienceBefore = player.experience;
    const swordBefore = skillLevel(player, "sword");
    const magicBefore = player.progression.magicLevel;
    const manaSpentBefore = player.progression.manaSpent;
    expect(swordBefore).toBeGreaterThan(10);
    expect(magicBefore).toBeGreaterThan(0);

    const penalty = player.applyDeathPenalty("player-death:veteran");

    expect(penalty.lostExperience).toBeGreaterThan(0);
    expect(player.experience).toBe(experienceBefore - penalty.lostExperience);
    // Magic drains the mana spent toward the next level first, and only
    // loses a level once that pool runs out (Canary's Player::death).
    expect(
      player.progression.magicLevel < magicBefore ||
        player.progression.manaSpent < manaSpentBefore,
    ).toBe(true);
    expect(skillLevel(player, "sword")).toBeLessThan(swordBefore);
    expect(penalty.lostSkillLevels).toContainEqual({
      skill: "sword",
      levels: swordBefore - skillLevel(player, "sword"),
    });
    expect(penalty.lostMagicLevels).toBe(
      magicBefore - player.progression.magicLevel,
    );
  });

  it("replays a death event without charging any leg twice", () => {
    const player = makeVeteran("replayer");
    player.applyDeathPenalty("player-death:replayer");
    const experienceAfter = player.experience;
    const swordAfter = skillLevel(player, "sword");
    const magicAfter = player.progression.magicLevel;

    const replay = player.applyDeathPenalty("player-death:replayer");

    expect(replay).toEqual({
      lostExperience: 0,
      lostMagicLevels: 0,
      lostSkillLevels: [],
    });
    expect(player.experience).toBe(experienceAfter);
    expect(skillLevel(player, "sword")).toBe(swordAfter);
    expect(player.progression.magicLevel).toBe(magicAfter);
  });

  it("never drops a skill below its starting level or experience below zero", () => {
    const player = new Player(makeCharacter("novice"), POSITION, 0);

    const penalty = player.applyDeathPenalty("player-death:novice");

    expect(penalty.lostExperience).toBe(0);
    expect(player.experience).toBe(0);
    expect(skillLevel(player, "sword")).toBe(10);
    expect(player.progression.magicLevel).toBe(0);
    expect(
      player.progression.skills.every((skill) => skill.tries >= 0),
    ).toBe(true);
  });

  it("charges a ganged victim less than a fair fight", () => {
    const fair = makeVeteran("fair");
    const ganged = makeVeteran("ganged");

    const fairPenalty = fair.applyDeathPenalty("player-death:fair");
    const gangedPenalty = ganged.applyDeathPenalty("player-death:ganged", {
      unfairFightReduction: 25,
    });

    expect(gangedPenalty.lostExperience).toBeLessThan(
      fairPenalty.lostExperience,
    );
    expect(gangedPenalty.lostExperience).toBeGreaterThan(0);
  });
});
