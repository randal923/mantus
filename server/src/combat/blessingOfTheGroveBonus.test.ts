import { describe, expect, it } from "vitest";
import { EMPTY_WHEEL_BONUSES, type CharacterVocation } from "@tibia/protocol";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { blessingOfTheGroveBonus } from "./blessingOfTheGroveBonus";

const CASTER_ID = "00000000-0000-4000-8000-000000000041";
const TARGET_ID = "00000000-0000-4000-8000-000000000042";

function makePlayer(
  id: string,
  vocation: CharacterVocation,
  redStage = 0,
): Player {
  const player = new Player(
    { ...makeCharacter(id, `Grove ${id.slice(-1)}`), vocation },
    { x: 1, y: 1, z: 7 },
    0,
  );
  if (redStage > 0) {
    player.setWheelBonuses({
      ...EMPTY_WHEEL_BONUSES,
      revelationStages: { green: 0, red: redStage, blue: 0, purple: 0 },
    });
  }
  return player;
}

function atHealthPercent(player: Player, percent: number): Player {
  player.setHealth(Math.floor((player.maxHealth * percent) / 100));
  return player;
}

describe("blessingOfTheGroveBonus", () => {
  // Bands and values from Canary checkBlessingGroveHealingByTarget
  // (player_wheel.cpp:3133-3160).
  it("scales with the target's missing health per stage", () => {
    const caster = makePlayer(CASTER_ID, "Elder Druid", 2);
    const target = makePlayer(TARGET_ID, "Elite Knight");
    expect(blessingOfTheGroveBonus(caster, atHealthPercent(target, 25))).toBe(18);
    expect(blessingOfTheGroveBonus(caster, atHealthPercent(target, 50))).toBe(9);
    expect(blessingOfTheGroveBonus(caster, atHealthPercent(target, 90))).toBe(0);
  });

  it("never applies to self, other vocations, or stage zero", () => {
    const caster = makePlayer(CASTER_ID, "Elder Druid", 3);
    expect(blessingOfTheGroveBonus(caster, atHealthPercent(caster, 10))).toBe(0);
    const knight = makePlayer(TARGET_ID, "Elite Knight");
    knight.setWheelBonuses({
      ...EMPTY_WHEEL_BONUSES,
      revelationStages: { green: 0, red: 3, blue: 0, purple: 0 },
    });
    const lowTarget = atHealthPercent(makePlayer(CASTER_ID, "Elder Druid"), 10);
    expect(blessingOfTheGroveBonus(knight, lowTarget)).toBe(0);
    const stageless = makePlayer(CASTER_ID, "Elder Druid", 0);
    expect(
      blessingOfTheGroveBonus(stageless, atHealthPercent(knight, 10)),
    ).toBe(0);
  });
});
