import {
  type CombatConditionState,
  type ConditionType,
  type CreatureOutfit,
  type Direction,
} from "@tibia/protocol";
import type {
  ActiveCondition,
  ConditionApplication,
  ConditionTick,
} from "./Condition";

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_TICKS_PER_SERVER_TICK = 5;
const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];
const STACKING_CONDITIONS = new Set<ConditionType>([
  "poison",
  "fire",
  "energy",
]);

export class ConditionManager {
  private readonly active = new Map<ConditionType, ActiveCondition>();

  apply(application: ConditionApplication, now: number): boolean {
    this.assertApplication(application);
    const current = this.active.get(application.type);
    const stacks = STACKING_CONDITIONS.has(application.type)
      ? Math.min(3, (current?.stacks ?? 0) + 1)
      : 1;
    const tickIntervalMs = application.tickIntervalMs;
    const nextTickAt =
      tickIntervalMs === undefined
        ? null
        : current?.nextTickAt && current.nextTickAt > now
          ? current.nextTickAt
          : now + tickIntervalMs;
    const magnitude = Math.max(
      current?.magnitude ?? 0,
      application.magnitude ?? 0,
    );
    this.active.set(application.type, {
      ...application,
      ...(magnitude > 0 ? { magnitude } : {}),
      startedAt: now,
      expiresAt: now + application.durationMs,
      stacks,
      nextTickAt,
    });
    return true;
  }

  remove(type: ConditionType): boolean {
    return this.active.delete(type);
  }

  clear(): boolean {
    if (this.active.size === 0) return false;
    this.active.clear();
    return true;
  }

  has(type: string): boolean {
    return this.active.has(type as ConditionType);
  }

  tick(now: number): {
    effects: ReadonlyArray<ConditionTick>;
    changed: boolean;
  } {
    const effects: ConditionTick[] = [];
    let changed = false;
    for (const [type, condition] of [...this.active]) {
      let nextTickAt = condition.nextTickAt;
      let ticks = 0;
      while (
        nextTickAt !== null &&
        nextTickAt <= now &&
        nextTickAt <= condition.expiresAt &&
        ticks < MAX_TICKS_PER_SERVER_TICK
      ) {
        if (
          condition.damageType &&
          condition.magnitude !== undefined &&
          condition.magnitude > 0
        ) {
          effects.push({
            sourceId: condition.sourceId,
            type,
            damageType: condition.damageType,
            amount: condition.magnitude * condition.stacks,
            ...(condition.effectId ? { effectId: condition.effectId } : {}),
          });
        }
        nextTickAt += condition.tickIntervalMs ?? 0;
        ticks++;
      }
      if (nextTickAt !== condition.nextTickAt) {
        this.active.set(type, { ...condition, nextTickAt });
      }
      if (condition.expiresAt <= now) {
        this.active.delete(type);
        changed = true;
      }
    }
    return { effects, changed };
  }

  project(now: number): CombatConditionState[] {
    return [...this.active.values()]
      .map((condition) => ({
        type: condition.type,
        remainingMs: Math.max(0, condition.expiresAt - now),
        stacks: condition.stacks,
      }))
      .sort((left, right) => left.type.localeCompare(right.type));
  }

  get speedModifier(): number {
    return (
      (this.active.get("haste")?.magnitude ?? 0) -
      (this.active.get("paralyze")?.magnitude ?? 0)
    );
  }

  get outfit(): CreatureOutfit | null {
    return this.active.get("outfit")?.outfit ?? null;
  }

  get light(): { intensity: number; color: number } {
    return (
      this.active.get("light")?.light ?? {
        intensity: 0,
        color: 0,
      }
    );
  }

  resolveDirection(direction: Direction, now: number): Direction {
    const drunk = this.active.get("drunk");
    if (!drunk) return direction;
    const index = DIRECTIONS.indexOf(direction);
    const offset = ((Math.floor((now - drunk.startedAt) / 500) % 3) + 3) % 3 - 1;
    return DIRECTIONS[(index + offset + DIRECTIONS.length) % DIRECTIONS.length] ??
      direction;
  }

  private assertApplication(application: ConditionApplication): void {
    if (
      !Number.isInteger(application.durationMs) ||
      application.durationMs < 1 ||
      application.durationMs > MAX_DURATION_MS
    ) {
      throw new Error("condition duration is out of range");
    }
    if (
      application.magnitude !== undefined &&
      (!Number.isInteger(application.magnitude) ||
        application.magnitude < 0 ||
        application.magnitude > 1_000_000)
    ) {
      throw new Error("condition magnitude is out of range");
    }
    if (
      application.tickIntervalMs !== undefined &&
      (!Number.isInteger(application.tickIntervalMs) ||
        application.tickIntervalMs < 250 ||
        application.tickIntervalMs > MAX_DURATION_MS)
    ) {
      throw new Error("condition tick interval is out of range");
    }
  }
}
