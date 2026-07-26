import { describe, expect, it } from "vitest";
import { WorldActionRng } from "../action/WorldActionRng";
import { rollMonsterGrid, type GridCandidate } from "./rollMonsterGrid";

function makePool(size: number): GridCandidate[] {
  const pool: GridCandidate[] = [];
  for (let index = 0; index < size; index += 1) {
    pool.push({
      raceId: index + 1,
      // Spread stars 1-4 evenly so every bucket can fill.
      stars: (index % 4) + 1,
      preyExclusive: false,
    });
  }
  return pool;
}

describe("rollMonsterGrid", () => {
  it("returns an empty grid below the 36-entry pool guard", () => {
    const rng = new WorldActionRng(1);
    expect(rollMonsterGrid(makePool(35), new Set(), 50, rng)).toEqual([]);
  });

  it("rolls nine unique races outside the blacklist", () => {
    const rng = new WorldActionRng(7);
    const blackList = new Set([1, 2, 3, 4, 5]);
    const grid = rollMonsterGrid(makePool(60), blackList, 50, rng);
    expect(grid).toHaveLength(9);
    expect(new Set(grid).size).toBe(9);
    for (const raceId of grid) expect(blackList.has(raceId)).toBe(false);
  });

  // 40 entries sorted by star: indexes 0-9 are 1★, 10-19 2★, 20-29 3★,
  // 30-39 4★. Scripting the picks keeps tries below the fallback so the
  // pure quota behavior is observable.
  const starSortedPool = () =>
    makePool(40).map((entry, index) => ({
      ...entry,
      stars: Math.min(Math.floor(index / 10) + 1, 4),
    }));

  it("respects the low-level star quotas (3/3/2/1) while tries stay low", () => {
    const picks = [0, 1, 2, 10, 11, 12, 20, 21, 30];
    let cursor = 0;
    const rng = { integer: () => picks[cursor++] ?? 0 };
    const pool = starSortedPool();
    const byRace = new Map(pool.map((entry) => [entry.raceId, entry]));
    const grid = rollMonsterGrid(pool, new Set(), 50, rng);
    const stars = grid.map((raceId) => byRace.get(raceId)?.stars ?? 0);
    expect(stars.filter((value) => value <= 1)).toHaveLength(3);
    expect(stars.filter((value) => value === 2)).toHaveLength(3);
    expect(stars.filter((value) => value === 3)).toHaveLength(2);
    expect(stars.filter((value) => value >= 4)).toHaveLength(1);
  });

  it("shifts quotas toward high stars for high levels (1/1/3/4)", () => {
    const picks = [0, 10, 20, 21, 22, 30, 31, 32, 33];
    let cursor = 0;
    const rng = { integer: () => picks[cursor++] ?? 0 };
    const pool = starSortedPool();
    const byRace = new Map(pool.map((entry) => [entry.raceId, entry]));
    const grid = rollMonsterGrid(pool, new Set(), 600, rng);
    const stars = grid.map((raceId) => byRace.get(raceId)?.stars ?? 0);
    expect(stars.filter((value) => value <= 1)).toHaveLength(1);
    expect(stars.filter((value) => value === 2)).toHaveLength(1);
    expect(stars.filter((value) => value === 3)).toHaveLength(3);
    expect(stars.filter((value) => value >= 4)).toHaveLength(4);
  });

  it("rejects a quota-exceeding pick before ten tries but accepts it after", () => {
    // Ten 1★ picks in a row: the first three fill the 1★ quota, the next
    // six are rejected, and the tenth try lands via the fallback.
    const picks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21, 30];
    let cursor = 0;
    const rng = { integer: () => picks[cursor++] ?? 0 };
    const pool = starSortedPool();
    const byRace = new Map(pool.map((entry) => [entry.raceId, entry]));
    const grid = rollMonsterGrid(pool, new Set(), 50, rng);
    const stars = grid.map((raceId) => byRace.get(raceId)?.stars ?? 0);
    // Four 1★ entries: three by quota plus the tries>=10 fallback pick.
    expect(stars.filter((value) => value <= 1)).toHaveLength(4);
    expect(grid).toHaveLength(9);
  });

  it("never offers prey-exclusive races", () => {
    const rng = new WorldActionRng(17);
    const pool = makePool(80).map((entry) => ({
      ...entry,
      preyExclusive: entry.raceId % 2 === 0,
    }));
    const grid = rollMonsterGrid(pool, new Set(), 50, rng);
    expect(grid).toHaveLength(9);
    for (const raceId of grid) expect(raceId % 2).toBe(1);
  });

  it("falls back past quotas after ten fruitless tries", () => {
    // Every candidate is 1★, so buckets 2-4 can never fill; the tries
    // fallback must still complete the grid.
    const rng = new WorldActionRng(19);
    const pool = makePool(50).map((entry) => ({ ...entry, stars: 1 }));
    const grid = rollMonsterGrid(pool, new Set(), 50, rng);
    expect(grid).toHaveLength(9);
  });
});
