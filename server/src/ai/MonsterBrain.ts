import type { Direction, Position } from "@tibia/protocol";
import type { Monster } from "../creature/Monster";
import { findPath } from "../pathfinding/findPath";
import type { MoveResult, World } from "../World";

const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

export class MonsterBrain {
  private nextThinkAt: number;
  private randomState: number;
  private targetId: string | null = null;
  private cachedGoal = "";
  private cachedPath: Direction[] = [];
  private brainState: "idle" | "wander" | "chase" | "return-home" = "idle";

  constructor(
    private readonly monster: Monster,
    now: number,
    seed: number,
    private readonly config: {
      thinkIntervalMs: number;
      acquisitionRange: number;
      loseRange: number;
      maxPathNodes: number;
      wanderChance: number;
    },
  ) {
    this.randomState = this.seedFor(seed, monster.id);
    this.nextThinkAt = now + (this.randomState % config.thinkIntervalMs);
  }

  get state(): string {
    return this.brainState;
  }

  get targetCreatureId(): string | null {
    return this.targetId;
  }

  tick(
    world: World,
    now: number,
    availableWork: number,
  ): { work: number; movement: MoveResult | null } {
    if (availableWork <= 0 || now < this.nextThinkAt) {
      return { work: 0, movement: null };
    }
    this.nextThinkAt = Math.max(
      now + this.config.thinkIntervalMs,
      this.monster.nextStepAt,
    );
    let work = 1;
    let target = this.targetId ? world.getPlayer(this.targetId) : undefined;
    if (target && !this.canKeepTarget(world, target.position)) {
      target = undefined;
      this.targetId = null;
      this.clearPath();
    }
    if (!target && this.monster.type.flags.hostile) {
      target = this.acquireTarget(world);
      this.targetId = target?.id ?? null;
    }
    if (target) {
      this.brainState = "chase";
      const targetDistance = this.monster.type.flags.targetDistance;
      if (this.distance(this.monster.position, target.position) <= targetDistance) {
        return { work, movement: null };
      }
      if (this.monster.type.speed <= 0) return { work, movement: null };
      const result = this.moveToward(
        world,
        target.position,
        targetDistance,
        now,
        availableWork - work,
      );
      work += result.work;
      return { work, movement: result.movement };
    }
    const homeDistance = this.distance(this.monster.position, this.monster.home);
    if (this.monster.type.speed <= 0) {
      this.brainState = "idle";
      return { work, movement: null };
    }
    if (
      homeDistance >= Math.max(1, this.monster.spawnRadius) ||
      (homeDistance > 0 && this.random() < 0.25)
    ) {
      this.brainState = "return-home";
      const result = this.moveToward(
        world,
        this.monster.home,
        0,
        now,
        availableWork - work,
      );
      work += result.work;
      return { work, movement: result.movement };
    }
    this.clearPath();
    if (this.monster.spawnRadius === 0 || this.random() >= this.config.wanderChance) {
      this.brainState = "idle";
      return { work, movement: null };
    }
    this.brainState = "wander";
    const first = Math.floor(this.random() * DIRECTIONS.length);
    let lastMovement: MoveResult | null = null;
    for (let offset = 0; offset < DIRECTIONS.length; offset++) {
      const direction = DIRECTIONS[(first + offset) % DIRECTIONS.length];
      if (!direction) continue;
      const movement = world.tryMoveCreature(this.monster, direction, now, {
        home: this.monster.home,
        radius: this.monster.spawnRadius,
      });
      if (movement.moved) return { work, movement };
      lastMovement = movement;
    }
    return {
      work,
      movement: lastMovement?.turned ? lastMovement : null,
    };
  }

  private acquireTarget(world: World) {
    const range = this.config.acquisitionRange;
    return world
      .playersNear(this.monster.position, { x: range, y: range })
      .filter((player) => this.canAcquireTarget(world, player.position))
      .sort((left, right) => {
        const distance =
          this.distance(this.monster.position, left.position) -
          this.distance(this.monster.position, right.position);
        return distance || left.id.localeCompare(right.id);
      })[0];
  }

  private canAcquireTarget(world: World, position: Position): boolean {
    return (
      position.z === this.monster.home.z &&
      this.distance(position, this.monster.home) <= this.monster.spawnRadius &&
      world.canSee(this.monster.position, position, {
        x: this.config.acquisitionRange,
        y: this.config.acquisitionRange,
      })
    );
  }

  private canKeepTarget(world: World, position: Position): boolean {
    return (
      position.z === this.monster.home.z &&
      this.distance(this.monster.position, position) <= this.config.loseRange &&
      this.distance(position, this.monster.home) <=
        this.monster.spawnRadius + this.monster.type.flags.targetDistance &&
      world.canSee(this.monster.position, position, {
        x: this.config.loseRange,
        y: this.config.loseRange,
      })
    );
  }

  private moveToward(
    world: World,
    goal: Position,
    goalDistance: number,
    now: number,
    availableWork: number,
  ): { work: number; movement: MoveResult | null } {
    if (availableWork <= 0) return { work: 0, movement: null };
    const goalKey = `${goal.x},${goal.y},${goal.z}:${goalDistance}`;
    if (this.cachedGoal !== goalKey || this.cachedPath.length === 0) {
      const result = findPath({
        start: this.monster.position,
        isGoal: (position) => this.distance(position, goal) <= goalDistance,
        canStep: (position) =>
          position.z === this.monster.home.z &&
          this.distance(position, this.monster.home) <= this.monster.spawnRadius &&
          world.isPathable(position) &&
          !world.isOccupied(position),
        maxVisited: Math.min(this.config.maxPathNodes, availableWork),
      });
      this.cachedGoal = goalKey;
      this.cachedPath = result.directions;
      if (this.cachedPath.length === 0) return { work: result.visited, movement: null };
      return {
        work: result.visited,
        movement: this.takeCachedStep(world, now),
      };
    }
    return { work: 0, movement: this.takeCachedStep(world, now) };
  }

  private takeCachedStep(world: World, now: number): MoveResult | null {
    const direction = this.cachedPath.shift();
    if (!direction) return null;
    const movement = world.tryMoveCreature(this.monster, direction, now, {
      home: this.monster.home,
      radius: this.monster.spawnRadius,
    });
    if (!movement.moved) this.clearPath();
    return movement;
  }

  private clearPath(): void {
    this.cachedGoal = "";
    this.cachedPath = [];
  }

  private distance(left: Position, right: Position): number {
    if (left.z !== right.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0 || 0x9e3779b9;
    return this.randomState / 0x1_0000_0000;
  }

  private seedFor(seed: number, id: string): number {
    let value = seed >>> 0;
    for (let index = 0; index < id.length; index++) {
      value = Math.imul(value ^ id.charCodeAt(index), 16_777_619) >>> 0;
    }
    return value || 0x9e3779b9;
  }
}
