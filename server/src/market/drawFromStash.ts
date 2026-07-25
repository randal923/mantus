import type { PoolClient } from "pg";
import { bumpStashRevisionUpdate } from "../depot/sql/bumpStashRevisionUpdate";
import { deleteStashRow } from "../depot/sql/deleteStashRow";
import { lockStashRowQuery } from "./sql/lockStashRowQuery";
import { reduceStashRowUpdate } from "./sql/reduceStashRowUpdate";

export interface StashDraw {
  /** How many units each newly minted row should hold. */
  readonly counts: ReadonlyArray<number>;
  /** The counter after the draw; 0 means the row was deleted. */
  readonly remaining: number;
}

/**
 * Takes `take` units out of the character's stash counter, inside the caller's
 * open transaction, and reports how to split them into rows. The counter is
 * decremented here and the rows are minted by the caller in the same
 * transaction — one atomic move, never copy-then-delete (charter rule 2).
 *
 * Returns null when the stash cannot cover the draw at execution time, which
 * is the only reading that counts: the plan was made from a memory snapshot
 * that a racing create may already have spent.
 */
export async function drawFromStash(
  client: PoolClient,
  characterId: string,
  itemTypeId: number,
  take: number,
  maxCount: number,
): Promise<StashDraw | null> {
  if (!Number.isInteger(take) || take < 1 || maxCount < 1) return null;
  const locked = await client.query<{ count: string }>(lockStashRowQuery, [
    characterId,
    itemTypeId,
  ]);
  const current = Number(locked.rows[0]?.count ?? 0);
  if (!Number.isSafeInteger(current) || current < take) return null;
  // The counter is constrained to 1 or more, so emptying it means deleting
  // the row rather than writing a zero.
  const reduced =
    current === take
      ? await client.query(deleteStashRow, [characterId, itemTypeId])
      : await client.query(reduceStashRowUpdate, [
          characterId,
          itemTypeId,
          take,
        ]);
  if (reduced.rowCount !== 1) return null;
  await client.query(bumpStashRevisionUpdate, [characterId]);
  const counts: number[] = [];
  for (let left = take; left > 0; left -= maxCount) {
    counts.push(Math.min(maxCount, left));
  }
  return { counts, remaining: current - take };
}
