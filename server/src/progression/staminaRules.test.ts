import { describe, expect, it } from "vitest";
import {
  decayHuntStamina,
  getStaminaExperienceMultiplier,
  regenerateOfflineStamina,
} from "./staminaRules";

describe("regenerateOfflineStamina", () => {
  it("ignores absences shorter than the 10-minute grace plus 3 minutes", () => {
    // 779s = 600s grace + 179s countable, below the 180s minimum.
    expect(regenerateOfflineStamina(2_000, 779)).toBe(2_000);
    expect(regenerateOfflineStamina(2_000, 600)).toBe(2_000);
    expect(regenerateOfflineStamina(2_000, 0)).toBe(2_000);
  });

  it("regenerates one stamina-minute per 3 real minutes in the normal band", () => {
    // 780s → 180s countable → exactly one stamina-minute.
    expect(regenerateOfflineStamina(2_000, 780)).toBe(2_001);
    // 600s grace + 30*180s = 6000s → +30.
    expect(regenerateOfflineStamina(2_000, 600 + 30 * 180)).toBe(2_030);
  });

  it("regenerates the green band at half speed and never exceeds the cap", () => {
    // Already green: 1 minute per 6 real minutes.
    expect(regenerateOfflineStamina(2_340, 600 + 10 * 360)).toBe(2_350);
    // Enormous absence clamps to the 2520 maximum.
    expect(regenerateOfflineStamina(2_500, 86_400 * 30)).toBe(2_520);
  });

  it("crosses from the normal band into the green band deterministically", () => {
    // stamina 2330: 10 min of normal headroom (needs 10*180s), then green.
    // countable = 10*180 + 1*360 = 2160 → +10 normal, +1 green → 2341.
    expect(regenerateOfflineStamina(2_330, 600 + 2_160)).toBe(2_341);
  });
});

describe("decayHuntStamina", () => {
  it("removes two stamina on the first hunt after login (seed 0)", () => {
    const result = decayHuntStamina(100, 0, 1_000_000);
    expect(result).toEqual({
      staminaMinutes: 98,
      nextDecayAt: 1_000_000 + 120_000,
      changed: true,
    });
  });

  it("throttles bursts of kills to at most one decrement per interval", () => {
    // Within an armed interval, further hunts do not decay.
    expect(decayHuntStamina(98, 1_120_000, 1_050_000)).toEqual({
      staminaMinutes: 98,
      nextDecayAt: 1_120_000,
      changed: false,
    });
    // A hunt inside the 60s window removes one and re-arms.
    expect(decayHuntStamina(98, 0, 30_000)).toEqual({
      staminaMinutes: 97,
      nextDecayAt: 90_000,
      changed: true,
    });
  });

  it("floors at zero and never underflows", () => {
    expect(decayHuntStamina(1, 0, 1_000_000).staminaMinutes).toBe(0);
    expect(decayHuntStamina(0, 0, 1_000_000)).toEqual({
      staminaMinutes: 0,
      nextDecayAt: 0,
      changed: false,
    });
  });
});

describe("getStaminaExperienceMultiplier", () => {
  it("grants the green premium bonus only above 2340 and only for premium", () => {
    expect(getStaminaExperienceMultiplier(2_341, true)).toBe(1.5);
    expect(getStaminaExperienceMultiplier(2_341, false)).toBe(1);
    expect(getStaminaExperienceMultiplier(2_340, true)).toBe(1);
  });

  it("applies the orange penalty at or below 840 and zero at empty", () => {
    expect(getStaminaExperienceMultiplier(840, true)).toBe(0.5);
    expect(getStaminaExperienceMultiplier(841, false)).toBe(1);
    expect(getStaminaExperienceMultiplier(0, true)).toBe(0);
  });
});
