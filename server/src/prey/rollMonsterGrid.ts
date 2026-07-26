/** One candidate from the bestiary pool (Feature 74/75 shared). */
export interface GridCandidate {
  readonly raceId: number;
  readonly stars: number;
  readonly preyExclusive: boolean;
}

/** The slice of WorldActionRng the roll needs (scriptable in tests). */
export interface GridRng {
  integer(minimum: number, maximum: number): number;
}

const GRID_SIZE = 9;

/**
 * Rolls a 9-monster selection grid, transcribed from pinned Canary
 * PreySlot::reloadMonsterGrid / TaskHuntingSlot::reloadMonsterGrid
 * (ioprey.cpp:57-131, 139-212): star-bucket quotas by level band, uniform
 * picks over the pool, every considered race joins the blacklist, rejects
 * (exclusives) still consume the attempt, and after 10 fruitless tries the
 * next pick lands regardless of bucket quotas. All RNG is server-side.
 */
export function rollMonsterGrid(
  pool: ReadonlyArray<GridCandidate>,
  blackList: ReadonlySet<number>,
  level: number,
  rng: GridRng,
): number[] {
  const grid: number[] = [];
  if (pool.length < 36) return grid;
  const considered = new Set(blackList);
  const buckets = bucketQuotas(level);
  let tries = 0;
  while (grid.length < GRID_SIZE && considered.size < pool.length) {
    const candidate = pool[rng.integer(0, pool.length - 1)];
    tries += 1;
    if (!candidate || considered.has(candidate.raceId)) continue;
    considered.add(candidate.raceId);
    if (candidate.preyExclusive) continue;
    const bucket = bucketFor(candidate.stars);
    if (buckets[bucket] > 0) {
      buckets[bucket] -= 1;
      grid.push(candidate.raceId);
    } else if (tries >= 10) {
      grid.push(candidate.raceId);
      tries = 0;
    }
  }
  return grid;
}

/** Star-bucket quotas per level band (ioprey.cpp:73-98). */
function bucketQuotas(level: number): [number, number, number, number] {
  const levelStage = Math.floor(level / 100);
  if (levelStage === 0) return [3, 3, 2, 1];
  if (levelStage <= 2) return [1, 3, 3, 2];
  if (levelStage <= 4) return [1, 2, 3, 3];
  return [1, 1, 3, 4];
}

function bucketFor(stars: number): 0 | 1 | 2 | 3 {
  if (stars <= 1) return 0;
  if (stars === 2) return 1;
  if (stars === 3) return 2;
  return 3;
}
