import type { Direction, Position } from "@tibia/protocol";
import type { Combat } from "../combat/Combat";
import { canMonsterAffect } from "../combat/canMonsterAffect";
import type { Creature } from "../creature/Creature";
import type { Monster } from "../creature/Monster";
import type {
  MonsterAbility,
  MonsterSummon,
} from "../creature/MonsterType";
import { Player } from "../Player";
import { CHASE_SEARCH_DISTANCE } from "../pathfinding/chaseSearchDistance";
import { findPath } from "../pathfinding/findPath";
import type { MoveResult, World } from "../World";

const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

/**
 * How long a monster may walk home without ever getting closer before it is
 * put back at its spawn. Canary never walks a monster home at all and
 * teleports one that leaves its spawn range (`Monster::onThink`,
 * monster.cpp:1622); this is the same safety net for a walk that cannot
 * succeed — a long wall between the lure and home that no single search
 * budget can round.
 */
const RETURN_HOME_STALL_MS = 30_000;

export class MonsterBrain {
  private nextThinkAt: number;
  private randomState: number;
  private targetId: string | null = null;
  private cachedGoal = "";
  private cachedPath: Direction[] = [];
  /** Whether the cached path ends at its goal rather than part-way there. */
  private cachedPathComplete = false;
  private readonly nextAbilityAt = new Map<MonsterAbility, number>();
  private readonly nextSummonAt = new Map<MonsterSummon, number>();
  private nextVoiceAt: number | null;
  private nextTargetChangeAt: number;
  /** While set, a challenge holds the target and blocks target changes. */
  private challengeFocusUntil = 0;
  /** Temporary melee pull from chivalrous challenge (Canary targetDistance). */
  private meleePullUntil = 0;
  private meleePullDistance = 0;
  /** Closest the walk home has come, and when it last got closer. */
  private returnBestDistance = Number.POSITIVE_INFINITY;
  private returnProgressAt = 0;
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
      combat?: Combat;
      summon?: (
        owner: Monster,
        typeId: string,
        maxCount: number,
        now: number,
      ) => boolean;
      speak?: (monster: Monster, text: string, yell: boolean) => void;
      /** Put the monster back at its spawn; false when no tile there is free. */
      returnHome?: (monster: Monster) => boolean;
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
    this.nextVoiceAt = monster.type.voices[0]
      ? now + monster.type.voices[0].intervalMs
      : null;
  }

  get state(): string {
    return this.brainState;
  }

  get targetCreatureId(): string | null {
    return this.targetId;
  }

  /**
   * Canary's `Monster::challengeCreature`: forces this monster onto the
   * challenger and holds it there for `durationMs`. The caller has already
   * re-validated the challenger at execution time; the brain re-checks that
   * the monster can actually acquire it, so a challenge can never point a
   * monster at something it would otherwise be unable to target.
   */
  challenge(
    world: World,
    challenger: Creature,
    now: number,
    durationMs: number,
  ): boolean {
    if (!this.monster.type.flags.hostile) return false;
    if (!this.canAcquireTarget(world, challenger)) return false;
    this.targetId = challenger.id;
    this.challengeFocusUntil = now + durationMs;
    this.nextTargetChangeAt = this.challengeFocusUntil;
    this.clearPath();
    return true;
  }

  /**
   * Canary's `Monster::changeTargetDistance`: pulls a distance monster into
   * melee for a while. Only ever reduces the distance, never increases it.
   */
  pullToMelee(distance: number, now: number, durationMs: number): boolean {
    if (distance >= this.monster.type.flags.targetDistance) return false;
    this.meleePullDistance = distance;
    this.meleePullUntil = now + durationMs;
    this.clearPath();
    return true;
  }

  private targetDistanceAt(now: number): number {
    return now < this.meleePullUntil
      ? this.meleePullDistance
      : this.monster.type.flags.targetDistance;
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
    this.useVoice(now);
    this.services?.combat?.onMonsterThink?.(this.monster, now);
    let work = 1;
    let target = this.targetId ? world.getCreature(this.targetId) : undefined;
    if (target && !this.canKeepTarget(world, target)) {
      target = undefined;
      this.targetId = null;
      this.clearPath();
    }
    if (this.monster.type.flags.hostile) {
      if (!target) {
        target = this.acquireTarget(world, this.targetSearchStrategy());
      } else if (
        this.monster.type.changeTarget.intervalMs > 0 &&
        now >= this.nextTargetChangeAt &&
        now >= this.challengeFocusUntil
      ) {
        this.nextTargetChangeAt =
          now + this.monster.type.changeTarget.intervalMs;
        if (this.randomChance(this.monster.type.changeTarget.chance)) {
          // Canary lets melee-distance monsters spread aggro; distance
          // monsters switch only to the nearest visible target.
          const search =
            this.targetDistanceAt(now) <= 1 ? "random" : "nearest";
          const preferred = this.acquireTarget(world, search);
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
      this.monster,
      now,
      availableWork - work,
    );
    work += defense.work;
    const summons = target
      ? this.useSummons(now, availableWork - work)
      : 0;
    work += summons;
    if (target) {
      this.returnBestDistance = Number.POSITIVE_INFINITY;
      const attacks = this.useAbilities(
        this.monster.type.attacks,
        target,
        now,
        availableWork - work,
      );
      work += attacks.work;
      const targetDistance = this.targetDistanceAt(now);
      const currentDistance = this.distance(
        this.monster.position,
        target.position,
      );
      const fleeing =
        this.monster.type.flags.runHealth > 0 &&
        this.monster.health <= this.monster.type.flags.runHealth;
      if (fleeing || currentDistance < targetDistance) {
        this.brainState = "flee";
        if (this.monster.type.speed <= 0) {
          return { work, movement: null };
        }
        const movement = this.moveAway(world, target.position, now);
        return { work, movement };
      }
      this.brainState = "chase";
      if (currentDistance <= targetDistance) {
        if (this.monster.type.speed <= 0) {
          return { work, movement: null };
        }
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
        // Canary parity: chasing searches a ±12 box around the monster, so
        // everything inside its view range is reachable if a path exists.
        { searchDistance: CHASE_SEARCH_DISTANCE },
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
      // Progress is measured in steps, not the chase range: a straight leg
      // of the walk that shortens only one axis is still progress.
      const stepsHome =
        Math.abs(this.monster.position.x - this.monster.home.x) +
        Math.abs(this.monster.position.y - this.monster.home.y);
      if (stepsHome < this.returnBestDistance) {
        this.returnBestDistance = stepsHome;
        this.returnProgressAt = now;
      }
      if (now - this.returnProgressAt >= RETURN_HOME_STALL_MS) {
        this.returnProgressAt = now;
        if (this.services?.returnHome?.(this.monster)) {
          this.clearPath();
          this.returnBestDistance = Number.POSITIVE_INFINITY;
          this.brainState = "idle";
          return { work, movement: null };
        }
      }
      const result = this.moveToward(
        world,
        this.monster.home,
        0,
        now,
        availableWork - work,
        // A lured monster may be the whole despawn radius from home, far
        // beyond one search budget: the guided search still hands back a
        // partial path toward home and the walk resumes from its end.
        { guided: true },
      );
      work += result.work;
      // A whole path home is progress even while a detour leads away.
      if (result.pathComplete) this.returnProgressAt = now;
      if (result.movement || availableWork - work <= 0) {
        return { work, movement: result.movement };
      }
      // Nothing visited gets closer to home (a dead-end pocket, a creature
      // in the only gap): shuffle one tile so the next search starts
      // elsewhere instead of standing on the same failure forever.
      return {
        work,
        movement: this.wanderStep(world, now, this.chaseLeash()),
      };
    }
    this.clearPath();
    this.returnBestDistance = Number.POSITIVE_INFINITY;
    if (this.monster.spawnRadius === 0 || this.random() >= this.config.wanderChance) {
      this.brainState = "idle";
      return { work, movement: null };
    }
    this.brainState = "wander";
    return {
      work,
      movement: this.wanderStep(world, now, {
        home: this.monster.home,
        radius: this.monster.spawnRadius,
      }),
    };
  }

  private wanderStep(
    world: World,
    now: number,
    leash: { home: Position; radius: number },
  ): MoveResult | null {
    const first = Math.floor(this.random() * DIRECTIONS.length);
    let lastMovement: MoveResult | null = null;
    for (let offset = 0; offset < DIRECTIONS.length; offset++) {
      const direction = DIRECTIONS[(first + offset) % DIRECTIONS.length];
      if (!direction) continue;
      const movement = world.tryMoveCreature(this.monster, direction, now, leash);
      if (movement.moved) return movement;
      lastMovement = movement;
    }
    return lastMovement?.turned ? lastMovement : null;
  }

  private acquireTarget(
    world: World,
    search: "nearest" | "health" | "damage" | "random",
  ): Creature | undefined {
    const range = this.config.acquisitionRange;
    const candidates = world
      .creaturesNear(this.monster.position, { x: range, y: range })
      .filter((creature) => this.canAcquireTarget(world, creature));
    if (candidates.length === 0) return undefined;
    if (search === "random") {
      return candidates[Math.floor(this.random() * candidates.length)];
    }
    if (search === "health") {
      return candidates.sort(
        (left, right) =>
          left.health - right.health || left.id.localeCompare(right.id),
      )[0];
    }
    if (search === "damage") {
      return candidates.sort(
        (left, right) =>
          this.monster.damageFrom(right.id) -
            this.monster.damageFrom(left.id) ||
          left.id.localeCompare(right.id),
      )[0];
    }
    return candidates.sort(
      (left, right) =>
        this.distance(this.monster.position, left.position) -
          this.distance(this.monster.position, right.position) ||
        left.id.localeCompare(right.id),
    )[0];
  }

  private targetSearchStrategy(): "nearest" | "health" | "damage" | "random" {
    const strategy = this.monster.type.targetStrategy;
    const roll = Math.floor(this.random() * 100) + 1;
    if (roll <= strategy.nearest) return "nearest";
    if (roll <= strategy.nearest + strategy.health) return "health";
    if (roll <= strategy.nearest + strategy.health + strategy.damage) {
      return "damage";
    }
    return "random";
  }

  private useAbilities(
    abilities: ReadonlyArray<MonsterAbility>,
    target: Creature | null,
    now: number,
    availableWork: number,
  ): { work: number } {
    if (!this.services?.combat || availableWork <= 0) return { work: 0 };
    let work = 0;
    for (const ability of abilities) {
      if (work >= availableWork) break;
      if (ability.kind === "stats") continue;
      if ((this.nextAbilityAt.get(ability) ?? 0) > now) continue;
      this.nextAbilityAt.set(ability, now + ability.intervalMs);
      work++;
      if (!this.randomChance(ability.chance)) continue;
      const executed = this.services.combat.executeMonsterAbility(
        this.monster,
        target ?? null,
        ability,
        now,
      );
      if (executed && ability.summon && this.services.summon) {
        this.services.summon(
          this.monster,
          ability.summon.typeId,
          ability.summon.maxCount,
          now,
        );
      }
    }
    return { work };
  }

  private useSummons(now: number, availableWork: number): number {
    if (!this.services?.summon || availableWork <= 0) return 0;
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

  private useVoice(now: number): void {
    if (this.nextVoiceAt === null || now < this.nextVoiceAt) return;
    const first = this.monster.type.voices[0];
    if (!first) {
      this.nextVoiceAt = null;
      return;
    }
    this.nextVoiceAt = now + first.intervalMs;
    if (!this.services?.speak || !this.randomChance(first.chance)) return;
    const voice =
      this.monster.type.voices[
        Math.floor(this.random() * this.monster.type.voices.length)
      ];
    if (voice) this.services.speak(this.monster, voice.text, voice.yell);
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
        this.distance(position, target) !== this.targetDistanceAt(now) ||
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

  private canAcquireTarget(world: World, creature: Creature): boolean {
    const { position } = creature;
    return (
      creature.health > 0 &&
      canMonsterAffect(world, this.monster, creature) &&
      this.canSeeCreature(creature) &&
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

  private canKeepTarget(world: World, creature: Creature): boolean {
    const { position } = creature;
    return (
      creature.health > 0 &&
      canMonsterAffect(world, this.monster, creature) &&
      this.canSeeCreature(creature) &&
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

  private canSeeCreature(creature: Creature): boolean {
    return (
      !(creature instanceof Player) ||
      !creature.hasCondition("invisible") ||
      this.monster.type.immunities.includes("invisible")
    );
  }

  /**
   * `searchDistance` boxes the search around the monster (chasing);
   * `guided` runs it as A* toward the goal and accepts a partial path when
   * the budget runs out (walking home from wherever a lure ended).
   */
  private moveToward(
    world: World,
    goal: Position,
    goalDistance: number,
    now: number,
    availableWork: number,
    options: { searchDistance?: number; guided?: boolean } = {},
  ): { work: number; movement: MoveResult | null; pathComplete: boolean } {
    if (availableWork <= 0) {
      return { work: 0, movement: null, pathComplete: false };
    }
    const { searchDistance, guided = false } = options;
    const goalKey = `${goal.x},${goal.y},${goal.z}:${goalDistance}`;
    if (this.cachedGoal !== goalKey || this.cachedPath.length === 0) {
      const start = this.monster.position;
      const result = findPath({
        start,
        isGoal: (position) => this.distance(position, goal) <= goalDistance,
        canStep: (position) =>
          position.z === this.monster.home.z &&
          (searchDistance === undefined ||
            this.distance(position, start) <= searchDistance) &&
          this.distance(position, this.monster.home) <=
            this.config.despawnRadius &&
          world.canCreaturePathTo(this.monster, position, now) &&
          !world.isOccupied(position),
        maxVisited: Math.min(this.config.maxPathNodes, availableWork),
        // Fewest steps that could still reach the goal's reach box: never
        // an overestimate, so the guided search stays shortest-path.
        ...(guided && {
          heuristic: (position: Position) =>
            Math.max(0, Math.abs(position.x - goal.x) - goalDistance) +
            Math.max(0, Math.abs(position.y - goal.y) - goalDistance),
        }),
      });
      this.cachedGoal = goalKey;
      this.cachedPath = result.directions;
      this.cachedPathComplete = result.complete;
      if (this.cachedPath.length === 0) {
        return { work: result.visited, movement: null, pathComplete: false };
      }
      return {
        work: result.visited,
        movement: this.takeCachedStep(world, now),
        pathComplete: result.complete,
      };
    }
    const pathComplete = this.cachedPathComplete;
    return { work: 0, movement: this.takeCachedStep(world, now), pathComplete };
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
    this.cachedPathComplete = false;
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
