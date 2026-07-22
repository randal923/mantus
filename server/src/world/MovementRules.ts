import type { Direction, Position } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { getStepDurationMs } from "../getStepDurationMs";
import type { MapData } from "../MapData";
import { Player } from "../Player";
import type { SpatialGrid } from "../SpatialGrid";
import type { MoveResult } from "./MoveResult";
import type { TileOccupancy } from "./TileOccupancy";

const DIRECTION_DELTAS: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
  northeast: [1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
  northwest: [-1, -1],
};

export class MovementRules {
  /** House-tile authorization, re-checked at execution time on every step. */
  private housePolicy:
    | ((player: Player, destination: Position) => boolean)
    | null = null;

  constructor(
    private readonly map: MapData,
    private readonly tickMs: number,
    private readonly grid: SpatialGrid,
    private readonly occupancy: TileOccupancy,
    private readonly fieldAt: (
      position: Position,
      now: number,
    ) => "energy" | "fire" | "poison" | undefined = () => undefined,
  ) {}

  setHousePolicy(
    policy: (player: Player, destination: Position) => boolean,
  ): void {
    this.housePolicy = policy;
  }

  private houseBlocked(creature: Creature, destination: Position): boolean {
    return (
      creature instanceof Player &&
      this.housePolicy !== null &&
      !this.housePolicy(creature, destination)
    );
  }

  /**
   * Validates and applies one step. All rules live here, at execution time:
   * walk-speed cooldown, bounds, blocked tiles, occupancy (charter rules 4, 8).
   */
  tryMove(player: Player, direction: Direction, now: number): MoveResult {
    return this.tryMoveInternal(player, direction, now, true);
  }

  tryMoveCreature(
    creature: Creature,
    direction: Direction,
    now: number,
    leash?: { home: Position; radius: number },
  ): MoveResult {
    return this.tryMoveInternal(creature, direction, now, false, leash);
  }

  tryMoveFearedCreature(
    creature: Creature,
    direction: Direction,
    now: number,
  ): MoveResult {
    return this.tryMoveInternal(creature, direction, now, false, undefined, true);
  }

  tryUseMap(player: Player, target: Position, now: number): MoveResult {
    return this.tryUseAction(player, target, now, "use");
  }

  /** Rope on a rope spot: same rules as a ladder, but only via use-with. */
  tryUseRopeSpot(player: Player, target: Position, now: number): MoveResult {
    return this.tryUseAction(player, target, now, "use-with");
  }

  private tryUseAction(
    player: Player,
    target: Position,
    now: number,
    activation: "use" | "use-with",
  ): MoveResult {
    const from = player.position;
    // Chebyshev distance: transitions (ladders, sewers, holes) are usable
    // from any of the eight surrounding tiles, or standing on them.
    const distance = Math.max(
      Math.abs(target.x - from.x),
      Math.abs(target.y - from.y),
    );
    if (target.z !== from.z || distance > 1) {
      return { moved: false, turned: false, reason: "blocked", retryAfterMs: 0 };
    }
    if (now < player.nextStepAt) {
      return {
        moved: false,
        turned: false,
        reason: "cooldown",
        retryAfterMs: player.nextStepAt - now,
      };
    }
    const action = this.map.getAction(target);
    if (
      !action ||
      action.activation !== activation ||
      !this.map.isWalkable(action.destination)
    ) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    if (this.houseBlocked(player, action.destination)) {
      return { moved: false, turned: false, reason: "blocked", retryAfterMs: 0 };
    }
    if (this.occupancy.isOccupied(action.destination)) {
      return { moved: false, turned: false, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(action.destination);
    if (!groundSpeed) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs =
      action.destination.z === from.z
        ? getStepDurationMs(player.stepSpeed, groundSpeed, this.tickMs)
        : 0;
    player.moveTo(action.destination);
    player.nextStepAt = now + durationMs;
    this.grid.move(player, from);
    return { moved: true, turned: false, from, durationMs };
  }

  private tryMoveInternal(
    creature: Creature,
    requestedDirection: Direction,
    now: number,
    allowTransitions: boolean,
    leash?: { home: Position; radius: number },
    forcedFearMovement = false,
  ): MoveResult {
    const direction = creature.conditions.resolveDirection(
      requestedDirection,
      now,
    );
    const turned = creature.direction !== direction;
    creature.direction = direction;

    if (
      creature.conditions.has("root") ||
      (creature.conditions.has("fear") && !forcedFearMovement)
    ) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }

    if (now < creature.nextStepAt) {
      return {
        moved: false,
        turned,
        reason: "cooldown",
        retryAfterMs: creature.nextStepAt - now,
      };
    }
    const [dx, dy] = DIRECTION_DELTAS[direction];
    const from = creature.position;
    const destination = {
      x: from.x + dx,
      y: from.y + dy,
      z: from.z,
    };
    if (forcedFearMovement && this.fieldAt(destination, now)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (
      creature instanceof Player &&
      creature.conditions.has("pz-lock") &&
      (this.map.getTile(destination)?.protectionZone ?? false)
    ) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (
      leash &&
      (destination.z !== leash.home.z ||
        Math.max(
          Math.abs(destination.x - leash.home.x),
          Math.abs(destination.y - leash.home.y),
        ) > leash.radius)
    ) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (!this.map.isWalkable(destination)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (creature instanceof Monster) {
      const field = this.fieldAt(destination, now);
      if (
        (field === "energy" && !creature.type.flags.canWalkOnEnergy) ||
        (field === "fire" && !creature.type.flags.canWalkOnFire) ||
        (field === "poison" && !creature.type.flags.canWalkOnPoison)
      ) {
        return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
      }
    }
    if (this.houseBlocked(creature, destination)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (this.occupancy.isOccupied(destination)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const transition = allowTransitions
      ? this.map.getTransition(destination, direction)
      : undefined;
    const resolved = transition?.destination ?? destination;
    if (this.houseBlocked(creature, resolved)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (!this.map.isWalkable(resolved)) {
      return {
        moved: false,
        turned,
        reason: transition ? "invalid-transition" : "blocked",
        retryAfterMs: 0,
      };
    }
    if (this.occupancy.isOccupied(resolved)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(resolved);
    if (!groundSpeed) {
      return {
        moved: false,
        turned,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs =
      resolved.z === from.z
        ? getStepDurationMs(
            creature.stepSpeed,
            groundSpeed,
            this.tickMs,
            dx !== 0 && dy !== 0,
          )
        : 0;
    creature.moveTo(resolved);
    creature.nextStepAt = now + durationMs;
    this.grid.move(creature, from);
    return { moved: true, turned, from, durationMs };
  }
}
