import type { Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type { WorldActionRng } from "./WorldActionRng";

/**
 * Execution-time context for one use-with tool action. Every mutation offered
 * here is applied synchronously inside the tick (or, for carried grants,
 * enqueued as one atomic operation); handlers never touch the DB directly and
 * never see a client-supplied value beyond the already-validated target.
 */
export interface ToolUseContext {
  readonly session: Session;
  readonly player: Player;
  readonly target: Position;
  readonly now: number;
  readonly world: World;
  readonly catalog: ItemCatalog;
  readonly rng: WorldActionRng;
  /** Topmost-first map items on the target tile, re-read at execution time. */
  readonly targetItems: ReadonlyArray<MapItem>;
  /** Transforms one map item in place; false when the plan was rejected. */
  readonly transform: (item: MapItem, toTypeId: number) => boolean;
  /** Removes one map item from the tile. */
  readonly remove: (item: MapItem) => boolean;
  /** Drops one world item on the target tile (Canary's Game.createItem). */
  readonly createOnTarget: (typeId: number) => boolean;
  /**
   * Grants one carried stack, optionally consuming one unit of `consumeTypeId`
   * in the same atomic operation. False when the operation could not start.
   */
  readonly grantCarried: (
    typeId: number,
    count: number,
    consumeTypeId?: number,
  ) => boolean;
  /** Units of a carried type the player holds right now. */
  readonly carriedCount: (typeId: number) => number;
  readonly effect: (effectId: number) => void;
  readonly say: (text: string) => void;
  readonly advanceFishing: (tries: number) => void;
  /** Spawns a monster near the target; absent without a spawn runtime. */
  readonly spawnMonster?: (typeName: string) => void;
}
