import { describe, expect, it } from "vitest";
import { computeBossRewardShares } from "./computeBossRewardShares";

describe("computeBossRewardShares", () => {
  it("splits scores across the three contribution kinds with 0.1 guards", () => {
    const shares = computeBossRewardShares([
      { characterId: "a", damageOut: 900, damageIn: 100, healing: 0 },
      { characterId: "b", damageOut: 100, damageIn: 0, healing: 50 },
    ]);
    const totalOut = 0.1 + 1_000;
    const totalIn = 0.1 + 100;
    const totalHealing = 0.1 + 50;
    const scoreA = (900 / totalOut + 100 / totalIn + 0 / totalHealing) / 3;
    const scoreB = (100 / totalOut + 0 / totalIn + 50 / totalHealing) / 3;
    const crowd = 1 / Math.cbrt(2);
    expect(shares).toHaveLength(2);
    expect(shares[0]!.characterId).toBe("a");
    expect(shares[0]!.topScore).toBe(true);
    expect(shares[0]!.score).toBeCloseTo(scoreA, 10);
    expect(shares[0]!.lootFactor).toBeCloseTo(
      crowd * Math.pow(1 + crowd, scoreA / 0.5),
      10,
    );
    expect(shares[1]!.topScore).toBe(false);
    expect(shares[1]!.score).toBeCloseTo(scoreB, 10);
  });

  it("drops zero-contribution entries and handles the empty fight", () => {
    expect(
      computeBossRewardShares([
        { characterId: "idle", damageOut: 0, damageIn: 0, healing: 0 },
      ]),
    ).toEqual([]);
    expect(computeBossRewardShares([])).toEqual([]);
  });

  it("a healer with no damage still earns a share", () => {
    const shares = computeBossRewardShares([
      { characterId: "tank", damageOut: 500, damageIn: 400, healing: 0 },
      { characterId: "healer", damageOut: 0, damageIn: 0, healing: 800 },
    ]);
    expect(shares.map((share) => share.characterId)).toContain("healer");
    expect(
      shares.find((share) => share.characterId === "healer")!.score,
    ).toBeGreaterThan(0);
  });
});
