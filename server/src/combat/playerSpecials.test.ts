import { describe, expect, it } from "vitest";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";
import { playerSpecials } from "./playerSpecials";

/** 500 hundredths = 5% critical chance on the item. */
const SWORD = { criticalHitChance: 500 } as unknown as ItemType;

function makePlayer(input: {
  premium: boolean;
  avatarStage?: number;
  avatarUntil?: number;
}): Player {
  return {
    vocation: "Knight",
    wheelBonuses: {
      revelationStages: { green: 0, blue: 0, purple: 0, red: 0 },
      criticalDamagePercent: 0,
    },
    avatarStage: input.avatarStage ?? 0,
    avatarUntil: input.avatarUntil ?? 0,
    isPremiumAt: () => input.premium,
  } as unknown as Player;
}

describe("playerSpecials", () => {
  it("adds the premium +3% critical chance on top of equipment", () => {
    const equipment = [{ item: {}, type: SWORD }];

    expect(
      playerSpecials(equipment, makePlayer({ premium: false }), 1_000)
        .criticalChance,
    ).toBe(5);
    expect(
      playerSpecials(equipment, makePlayer({ premium: true }), 1_000)
        .criticalChance,
    ).toBe(8);
  });

  it("keeps the avatar's 100% override above the premium bonus", () => {
    const player = makePlayer({
      premium: true,
      avatarStage: 2,
      avatarUntil: 10_000,
    });

    expect(playerSpecials([], player, 1_000).criticalChance).toBe(100);
  });
});
