import type { Direction, Position } from "@tibia/protocol";
import type { Combat } from "../combat/Combat";
import type { Monster } from "../creature/Monster";
import type {
  MonsterAbility,
  MonsterSummon,
} from "../creature/MonsterType";
import type { Player } from "../Player";
import { findPath } from "../pathfinding/findPath";
import type { MoveResult, World } from "../World";

const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

export class MonsterBrain {
  private nextThinkAt: number;
  private randomState: number;
  private targetId: string | null = null;
  private cachedGoal = "";
  private cachedPath: Direction[] = [];
  private readonly nextAbilityAt = new Map<MonsterAbility, number>();
  private readonly nextSummonAt = new Map<MonsterSummon, number>();
  private nextTargetChangeAt: number;
  private brainState:
    | "idle"
    | "wander"
    | "chase"
    | "flee"
    | "return-home" = "idle";

  constructor(
    private readonly monster: Monster,
    now: number,
    seed: number,
    private readonly config: {
      thinkIntervalMs: number;
      acquisitionRange: number;
      loseRange: number;
      despawnRadius: number;
      maxPathNodes: number;
      wanderChance: number;
    },
    private readonly services?: {
      combat: Combat;
      summon: (
        owner: Monster,
        typeId: string,
        maxCount: number,
        now: number,
      ) => boolean;
    },
  ) {
    this.randomState = this.seedFor(seed, monster.id);
    this.nextThinkAt = now + (this.randomState % config.thinkIntervalMs);
    this.nextTargetChangeAt = now + monster.type.changeTarget.intervalMs;
    for (const ability of [
      ...monster.type.attacks,
      ...monster.type.defenses,
    ]) {
      if (ability.kind === "stats") continue;
      this.nextAbilityAt.set(ability, now + ability.intervalMs);
    }
    for (const summon of monster.type.summons) {
      this.nextSummonAt.set(summon, now + summon.intervalMs);
    }
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
    if (target && !this.canKeepTarget(world, target)) {
      target = undefined;
      this.targetId = null;
      this.clearPath();
    }
    if (this.monster.type.flags.hostile) {
      if (!target) {
        target = this.acquireTarget(world);
      } else if (now >= this.nextTargetChangeAt) {
        this.nextTargetChangeAt =
          now + this.monster.type.changeTarget.intervalMs;
        if (this.randomChance(this.monster.type.changeTarget.chance)) {
          const preferred = this.acquireTarget(world);
          if (preferred && preferred.id !== target.id) {
            target = preferred;
            this.clearPath();
          }
        }
      }
      this.targetId = target?.id ?? null;
    }
    const defense = this.useAbilities(
      this.monster.type.defenses,
      target ?? null,
      now,
      availableWork - work,
    );
    work += defense.work;
    const summons = this.useSummons(now, availableWork - work);
    work += summons;
    if (target) {
      const attacks = this.useAbilities(
        this.monster.type.attacks,
        target,
        now,
        availableWork - work,
      );
      work += attacks.work;
      const targetDistance = this.monster.type.flags.targetDistance;
      const currentDistance = this.distance(
        this.monster.position,
        target.position,
      );
      const fleeing =
        this.monster.type.flags.runHealth > 0 &&
        this.monster.healthPercent <= this.monster.type.flags.runHealth;
      if (fleeing || currentDistance < targetDistance) {
        this.brainState = "flee";
        const movement = this.moveAway(world, target.position, now);
        return { work, movement };
      }
      this.brainState = "chase";
      if (currentDistance <= targetDistance) {
        if (
          this.randomChance(
            100 - this.monster.type.flags.staticAttackChance,
          )
        ) {
          return {
            work,
            movement: this.danceAround(world, target.position, now),
          };
        }
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
      .filter((player) => this.canAcquireTarget(world, player))
      .map((player) => ({ player, score: this.targetScore(player) }))
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.player.id.localeCompare(right.player.id),
      )[0]?.player;
  }

  private targetScore(player: Player): number {
    const strategy = this.monster.type.targetStrategy;
    const healthPercent = player.healthPercent;
    return (
      this.distance(this.monster.position, player.position) * strategy.nearest +
      healthPercent * strategy.health -
      this.monster.damageFrom(player.id) * strategy.damage +
      this.random() * strategy.random
    );
  }

  private useAbilities(
    abilities: ReadonlyArray<MonsterAbility>,
    target: Player | null,
    now: number,
    availableWork: number,
  ): { work: number } {
    if (!this.services || availableWork <= 0) return { work: 0 };
    let work = 0;
    for (const ability of abilities) {
      if (work >= availableWork) break;
      if (ability.kind === "stats") continue;
      if ((this.nextAbilityAt.get(ability) ?? 0) > now) continue;
      this.nextAbilityAt.set(ability, now + ability.intervalMs);
      work++;
      if (!this.randomChance(ability.chance)) continue;
      this.services.combat.executeMonsterAbility(
        this.monster,
        target ?? null,
        ability,
        now,
      );
    }
    return { work };
  }

  private useSummons(now: number, availableWork: number): number {
    if (!this.services || availableWork <= 0) return 0;
    let work = 0;
    for (const summon of this.monster.type.summons) {
      if (work >= availableWork) break;
      if ((this.nextSummonAt.get(summon) ?? 0) > now) continue;
      this.nextSummonAt.set(summon, now + summon.intervalMs);
      work++;
      if (!this.randomChance(summon.chance)) continue;
      this.services.summon(
        this.monster,
        summon.typeId,
        summon.maxCount,
        now,
      );
    }
    return work;
  }

  private moveAway(
    world: World,
    threat: Position,
    now: number,
  ): MoveResult | null {
    this.clearPath();
    const candidates = DIRECTIONS.map((direction) => {
      const [dx, dy] = this.delta(direction);
      const position = {
        x: this.monster.position.x + dx,
        y: this.monster.position.y + dy,
        z: this.monster.position.z,
      };
      return {
        direction,
        distance: this.distance(position, threat),
        position,
      };
    }).sort(
      (left, right) =>
        right.distance - left.distance ||
        left.direction.localeCompare(right.direction),
    );
    let turned: MoveResult | null = null;
    for (const candidate of candidates) {
      if (
        this.distance(candidate.position, this.monster.home) >
        this.config.despawnRadius
      ) {
        continue;
      }
      const movement = world.tryMoveCreature(
        this.monster,
        candidate.direction,
        now,
        this.chaseLeash(),
      );
      if (movement.moved) return movement;
      if (movement.turned) turned = movement;
    }
    return turned;
  }

  private danceAround(
    world: World,
    target: Position,
    now: number,
  ): MoveResult | null {
    this.clearPath();
    const first = Math.floor(this.random() * DIRECTIONS.length);
    let turned: MoveResult | null = null;
    for (let offset = 0; offset < DIRECTIONS.length; offset++) {
      const direction = DIRECTIONS[(first + offset) % DIRECTIONS.length];
      if (!direction) continue;
      const [dx, dy] = this.delta(direction);
      const position = {
        x: this.monster.position.x + dx,
        y: this.monster.position.y + dy,
        z: this.monster.position.z,
      };
      if (
        this.distance(position, target) !==
          this.monster.type.flags.targetDistance ||
        this.distance(position, this.monster.home) >
          this.config.despawnRadius
      ) {
        continue;
      }
      const movement = world.tryMoveCreature(
        this.monster,
        direction,
        now,
        this.chaseLeash(),
      );
      if (movement.moved) return movement;
      if (movement.turned) turned = movement;
    }
    return turned;
  }

  private canAcquireTarget(world: World, player: Player): boolean {
    const { position } = player;
    return (
      !player.conditions.has("invisible") &&
      position.z === this.monster.home.z &&
      !world.isProtectionZone(this.monster.position) &&
      !world.isProtectionZone(position) &&
      this.distance(position, this.monster.home) <= this.config.despawnRadius &&
      world.canSee(this.monster.position, position, {
        x: this.config.acquisitionRange,
        y: this.config.acquisitionRange,
      })
    );
  }

  private canKeepTarget(world: World, player: Player): boolean {
    const { position } = player;
    return (
      !player.conditions.has("invisible") &&
      position.z === this.monster.home.z &&
      !world.isProtectionZone(this.monster.position) &&
      !world.isProtectionZone(position) &&
      this.distance(this.monster.position, position) <= this.config.loseRange &&
      this.distance(position, this.monster.home) <= this.config.despawnRadius &&
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
          this.distance(position, this.monster.home) <=
            this.config.despawnRadius &&
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
    const movement = world.tryMoveCreature(
      this.monster,
      direction,
      now,
      this.chaseLeash(),
    );
    if (!movement.moved) this.clearPath();
    return movement;
  }

  /**
   * Canary parity: while engaging a target the only leash is the despawn
   * radius around the spawn point; the spawn radius bounds idle wandering
   * only.
   */
  private chaseLeash(): { home: Position; radius: number } {
    return { home: this.monster.home, radius: this.config.despawnRadius };
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

  private randomChance(percent: number): boolean {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    return this.random() * 100 < percent;
  }

  private delta(direction: Direction): readonly [number, number] {
    if (direction === "north") return [0, -1];
    if (direction === "east") return [1, 0];
    if (direction === "south") return [0, 1];
    return [-1, 0];
  }

  private seedFor(seed: number, id: string): number {
    let value = seed >>> 0;
    for (let index = 0; index < id.length; index++) {
      value = Math.imul(value ^ id.charCodeAt(index), 16_777_619) >>> 0;
    }
    return value || 0x9e3779b9;
  }
}
