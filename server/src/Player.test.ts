import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { makeCharacter } from "./test/makeCharacter";

describe("Player combat training", () => {
  it("matches Canary melee and distance skill-point rules", () => {
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000101"),
      { x: 1, y: 1, z: 7 },
      0,
    );

    player.recordAttackBlock("none");
    expect(player.attackSkillTries("melee", "none")).toBe(1);
    expect(player.attackSkillTries("distance", "none")).toBe(2);

    for (let index = 0; index < 30; index++) {
      player.recordAttackBlock("armor");
      expect(player.attackSkillTries("distance", "armor")).toBe(1);
    }
    player.recordAttackBlock("armor");
    expect(player.attackSkillTries("melee", "armor")).toBe(0);

    player.recordAttackBlock("immunity");
    expect(player.attackSkillTries("melee", "immunity")).toBe(0);
    expect(player.attackSkillTries("distance", "immunity")).toBe(0);
  });

  it("limits shielding training and defense rolls like Canary", () => {
    const player = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000102"),
      { x: 1, y: 1, z: 7 },
      0,
    );

    player.recordAttackBlock("none");
    for (let index = 0; index < 30; index++) {
      expect(player.consumeShieldTrainingBlock()).toBe(true);
    }
    expect(player.consumeShieldTrainingBlock()).toBe(false);

    player.tickDefense(0);
    expect(player.consumeDefenseBlock(999)).toBe(false);
    expect(player.consumeDefenseBlock(1_000)).toBe(true);
    expect(player.consumeDefenseBlock(1_000)).toBe(false);
    player.tickDefense(3_000);
    expect(player.consumeDefenseBlock(3_000)).toBe(true);
    expect(player.consumeDefenseBlock(3_000)).toBe(true);
    expect(player.consumeDefenseBlock(3_000)).toBe(false);
  });
});
