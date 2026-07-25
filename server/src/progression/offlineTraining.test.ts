import { describe, expect, it } from "vitest";
import { computeOfflineTraining } from "./offlineTraining";

const KNIGHT = {
  attackSpeedMs: 2_000,
  manaGainAmount: 2,
  manaGainIntervalMs: 6_000,
};

describe("computeOfflineTraining", () => {
  it("awards nothing when logged out for under 10 minutes", () => {
    expect(
      computeOfflineTraining({
        target: "sword",
        offlineSeconds: 599,
        barSeconds: 43_200,
        ...KNIGHT,
      }),
    ).toEqual({
      weaponSkill: null,
      weaponTries: 0,
      magicTries: 0,
      shieldingTries: 0,
      consumedBarSeconds: 0,
    });
  });

  it("converts weapon time at attack-speed/2 and co-trains shielding", () => {
    const result = computeOfflineTraining({
      target: "sword",
      offlineSeconds: 3_600,
      barSeconds: 3_600,
      ...KNIGHT,
    });
    // 3600 / (2000/1000) / 2 = 900 tries; shielding = 3600/4 = 900.
    expect(result).toEqual({
      weaponSkill: "sword",
      weaponTries: 900,
      magicTries: 0,
      shieldingTries: 900,
      consumedBarSeconds: 3_600,
    });
  });

  it("halves distance training relative to melee", () => {
    const result = computeOfflineTraining({
      target: "distance",
      offlineSeconds: 3_600,
      barSeconds: 3_600,
      ...KNIGHT,
    });
    expect(result.weaponTries).toBe(450);
  });

  it("converts magic time using the vocation mana-gain rate", () => {
    const result = computeOfflineTraining({
      target: "magic",
      offlineSeconds: 3_600,
      barSeconds: 3_600,
      attackSpeedMs: 2_000,
      manaGainAmount: 2,
      manaGainIntervalMs: 3_000,
    });
    // gainTicks = 3000/1000 = 3; tries = 3600 * (2/3) = 2400.
    expect(result.magicTries).toBe(2_400);
    expect(result.shieldingTries).toBe(900);
    expect(result.weaponSkill).toBeNull();
  });

  it("caps consumed time at the 12-hour bar and the offline span", () => {
    const result = computeOfflineTraining({
      target: "sword",
      offlineSeconds: 50_000,
      barSeconds: 50_000,
      ...KNIGHT,
    });
    expect(result.consumedBarSeconds).toBe(12 * 3_600);
  });

  it("scales tries by the configured offline-training rate", () => {
    const result = computeOfflineTraining({
      target: "sword",
      offlineSeconds: 3_600,
      barSeconds: 3_600,
      ...KNIGHT,
      rate: 2,
    });
    expect(result.weaponTries).toBe(1_800);
  });

  it("spends the bar but awards nothing below one minute of training", () => {
    const result = computeOfflineTraining({
      target: "sword",
      offlineSeconds: 650,
      barSeconds: 30,
      ...KNIGHT,
    });
    expect(result).toEqual({
      weaponSkill: null,
      weaponTries: 0,
      magicTries: 0,
      shieldingTries: 0,
      consumedBarSeconds: 30,
    });
  });
});
