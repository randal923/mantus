import type { Position, ViewRange } from "@tibia/protocol";
import { isNear } from "../item/isNear";
import type { Player } from "../Player";
import type { WorldAction } from "./WorldAction";
import type { WorldActionWorldView } from "./WorldActionWorldView";

type RegisteredKind = Exclude<
  WorldAction["kind"],
  "map-movement" | "unsupported"
>;

/**
 * The cross-cutting execution-time re-checks each registered kind needs. The
 * table is exhaustive over `RegisteredKind`, so a new kind cannot be added
 * without declaring its requirements — that is what keeps a handler from
 * silently skipping a check (charter rule 4).
 */
export interface WorldActionRequirements {
  /** "adjacent" needs a neighbouring tile; "visible" accepts line of sight. */
  readonly reach: "adjacent" | "visible";
  /** The resolved map item must still be the one on the tile. */
  readonly itemStillPlaced: boolean;
  /** House tiles authorize against current owner/guest state. */
  readonly houseAccess: boolean;
  /** Refused while an item operation for this session is still in flight. */
  readonly exclusive: boolean;
}

export const WORLD_ACTION_REQUIREMENTS: Readonly<
  Record<RegisteredKind, WorldActionRequirements>
> = {
  chest: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  clock: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: false,
    exclusive: false,
  },
  "daily-shrine": {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: false,
    exclusive: false,
  },
  "imbuement-shrine": {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: false,
    exclusive: false,
  },
  "decoration-kit": {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  door: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  food: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  harvest: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  lever: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  podium: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  read: {
    reach: "visible",
    itemStillPlaced: true,
    houseAccess: false,
    exclusive: false,
  },
  rotate: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
  write: {
    reach: "adjacent",
    itemStillPlaced: true,
    houseAccess: true,
    exclusive: true,
  },
};

export type WorldActionRejection =
  | "out-of-view"
  | "out-of-reach"
  | "stale-item"
  | "no-house-access"
  | "busy";

/**
 * Runs every requirement for `action` against live state. Returns null when
 * the action may proceed; "out-of-view" means answer nothing at all, so an
 * out-of-view probe stays indistinguishable from an empty tile (rule 6).
 */
export function checkWorldActionPreconditions(input: {
  readonly action: Extract<WorldAction, { kind: RegisteredKind }>;
  readonly player: Player;
  readonly position: Position;
  readonly viewRange: ViewRange;
  readonly world: WorldActionWorldView;
  readonly houseAccess: (characterId: string, position: Position) => boolean;
  readonly itemOperationPending: boolean;
}): WorldActionRejection | null {
  const { action, player, position, world } = input;
  const requirements = WORLD_ACTION_REQUIREMENTS[action.kind];
  const near = isNear(player.position, position);
  if (!near && !world.canSee(player.position, position, input.viewRange)) {
    return "out-of-view";
  }
  if (requirements.reach === "adjacent" && !near) return "out-of-reach";
  if (requirements.exclusive && input.itemOperationPending) return "busy";
  if (
    requirements.itemStillPlaced &&
    !world
      .getMapItems(position)
      .some((candidate) => candidate.instanceId === action.item.instanceId)
  ) {
    return "stale-item";
  }
  if (
    requirements.houseAccess &&
    world.getHouseId?.(position) !== undefined &&
    !input.houseAccess(player.id, position)
  ) {
    return "no-house-access";
  }
  return null;
}
