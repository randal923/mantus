import { describe, expect, it } from "vitest";
import type { CharacterVocation } from "@tibia/protocol";
import { getPartyExperienceShares } from "./getPartyExperienceShares";

function party(
  vocations: ReadonlyArray<CharacterVocation>,
): Array<{ playerId: string; vocation: CharacterVocation }> {
  return vocations.map((vocation, index) => ({
    playerId: `player-${index}`,
    vocation,
  }));
}

describe("getPartyExperienceShares", () => {
  it("applies the 1.2 multiplier for a single vocation", () => {
    const shares = getPartyExperienceShares(party(["Knight", "Knight"]), 100);
    // ceil(100 * 1.2 / 2)
    expect(shares).toEqual([
      { playerId: "player-0", amount: 60 },
      { playerId: "player-1", amount: 60 },
    ]);
  });

  it("applies the 1.3 multiplier for two unique vocations", () => {
    const shares = getPartyExperienceShares(party(["Knight", "Druid"]), 100);
    expect(shares.map((share) => share.amount)).toEqual([65, 65]);
  });

  it("applies the 1.6 multiplier for three unique vocations", () => {
    const shares = getPartyExperienceShares(
      party(["Knight", "Druid", "Paladin"]),
      300,
    );
    // ceil(300 * 1.6 / 3)
    expect(shares.map((share) => share.amount)).toEqual([160, 160, 160]);
  });

  it("applies the 2.0 multiplier for four unique vocations", () => {
    const shares = getPartyExperienceShares(
      party(["Knight", "Druid", "Paladin", "Sorcerer"]),
      400,
    );
    // (0.1·16 − 0.2·4 + 1.3) − 0.1 large-party penalty = 2.0
    expect(shares.map((share) => share.amount)).toEqual([200, 200, 200, 200]);
  });

  it("collapses promotions onto their base vocation", () => {
    const shares = getPartyExperienceShares(
      party(["Elite Knight", "Knight"]),
      100,
    );
    expect(shares.map((share) => share.amount)).toEqual([60, 60]);
  });

  it("caps the counted vocations at four", () => {
    const shares = getPartyExperienceShares(
      party(["Knight", "Druid", "Paladin", "Sorcerer", "Monk"]),
      500,
    );
    // V capped at 4 → multiplier 2.0, split across 5 members.
    expect(shares.map((share) => share.amount)).toEqual([
      200, 200, 200, 200, 200,
    ]);
  });

  it("rounds each share up", () => {
    const shares = getPartyExperienceShares(party(["Knight", "Knight"]), 5);
    // ceil(5 * 1.2 / 2) = ceil(3) = 3
    expect(shares.map((share) => share.amount)).toEqual([3, 3]);
  });
});
