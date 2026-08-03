import { MAX_STORABLE_CHARACTER_LEVEL } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getLevelForExperience } from "./getLevelForExperience";

/** Postgres `bigint` is signed 64-bit; that column is the only real ceiling. */
const INT64_MAX = (1n << 63n) - 1n;

/**
 * There is no level cap. Canary has none either — `uint32_t level`,
 * `uint64_t experience`, no CHECK on any of it — and the ceiling here is the
 * same kind of thing: the width of the column the experience is stored in.
 *
 * The reason this file exists is that the arithmetic used to run in JS
 * `number`, which stops being exact at 2^53. That is level ~81456, far below
 * anything a player could not reach, and the failure was silent: levels simply
 * started resolving wrong. Experience is bigint end to end now, so these hold.
 */
describe("progression has no level ceiling", () => {
  it("round-trips levels far past what a number can represent exactly", () => {
    for (const level of [1, 2, 8, 1_000, 50_000, 81_456, 200_000, 800_000]) {
      const experience = getExperienceForLevel(level);
      expect(getLevelForExperience(experience)).toBe(level);
      // One point short is still the level below — the boundary is exact.
      if (level > 1) {
        expect(getLevelForExperience(experience - 1n)).toBe(level - 1);
      }
    }
  });

  it("is exact where number arithmetic silently is not", () => {
    const level = 200_000;
    const experience = getExperienceForLevel(level);
    expect(experience).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    // The same value through `number` loses points and lands on a level
    // boundary that is no longer the true one.
    expect(BigInt(Number(experience))).not.toBe(experience);
    expect(getLevelForExperience(experience)).toBe(level);
  });

  it("reaches the storage ceiling and stops exactly there", () => {
    expect(
      getExperienceForLevel(MAX_STORABLE_CHARACTER_LEVEL),
    ).toBeLessThanOrEqual(INT64_MAX);
    expect(
      getExperienceForLevel(MAX_STORABLE_CHARACTER_LEVEL + 1),
    ).toBeGreaterThan(INT64_MAX);
  });

  it("matches Canary's getExpForLevel at the documented boundaries", () => {
    // Player::getExpForLevel, player.cpp — same cubic, uint64 arithmetic.
    expect(getExperienceForLevel(1)).toBe(0n);
    expect(getExperienceForLevel(2)).toBe(100n);
    expect(getExperienceForLevel(8)).toBe(4_200n);
    expect(getExperienceForLevel(100)).toBe(15_694_800n);
  });
});
