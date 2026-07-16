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
const DIRECTIONS: Direction[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];
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
      nextTickIndex: 0,
    });
    return true;
  }

  remove(type: ConditionType): boolean {
    return this.active.delete(type);
  }

  extend(application: ConditionApplication, now: number): boolean {
    const current = this.active.get(application.type);
    if (!current || current.expiresAt <= now) {
      return this.apply(application, now);
    }
    const durationMs = current.expiresAt - now + application.durationMs;
    if (durationMs > MAX_DURATION_MS) {
      throw new Error("condition duration is out of range");
    }
    this.active.set(application.type, {
      ...current,
      expiresAt: current.expiresAt + application.durationMs,
    });
    return true;
  }

  remainingMs(type: ConditionType, now: number): number {
    const condition = this.active.get(type);
    return condition ? Math.max(0, condition.expiresAt - now) : 0;
  }

  absorbMagicShield(amount: number): number {
    const condition = this.active.get("magic-shield");
    if (!condition || amount <= 0) return 0;
    if (condition.capacity === undefined) return amount;
    const absorbed = Math.min(condition.capacity, amount);
    const capacity = condition.capacity - absorbed;
    if (capacity === 0) {
      this.active.delete("magic-shield");
    } else {
      this.active.set("magic-shield", { ...condition, capacity });
    }
    return absorbed;
  }

  get allowsNaturalRegeneration(): boolean {
    return this.active.get("regeneration")?.naturalRegeneration === true;
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
      let nextTickIndex = condition.nextTickIndex;
      let ticks = 0;
      while (
        nextTickAt !== null &&
        nextTickAt <= now &&
        nextTickAt <= condition.expiresAt &&
        ticks < MAX_TICKS_PER_SERVER_TICK
      ) {
        const tickAmount =
          condition.tickAmounts?.[nextTickIndex] ?? condition.magnitude;
        if (condition.damageType && tickAmount !== undefined && tickAmount > 0) {
          effects.push({
            sourceId: condition.sourceId,
            type,
            damageType: condition.damageType,
            amount:
              condition.tickAmounts === undefined
                ? tickAmount * condition.stacks
                : tickAmount,
            ...(condition.effectId ? { effectId: condition.effectId } : {}),
          });
        }
        nextTickIndex++;
        nextTickAt += condition.tickIntervalMs ?? 0;
        if (
          condition.tickAmounts &&
          nextTickIndex >= condition.tickAmounts.length
        ) {
          nextTickAt = null;
        }
        ticks++;
      }
      if (
        nextTickAt !== condition.nextTickAt ||
        nextTickIndex !== condition.nextTickIndex
      ) {
        this.active.set(type, { ...condition, nextTickAt, nextTickIndex });
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
      application.tickAmounts !== undefined &&
      (application.tickAmounts.length < 1 ||
        application.tickAmounts.length > 1_000 ||
        application.tickAmounts.some(
          (amount) =>
            !Number.isInteger(amount) || amount < 1 || amount > 1_000_000,
        ))
    ) {
      throw new Error("condition tick amounts are out of range");
    }
    if (
      application.tickIntervalMs !== undefined &&
      (!Number.isInteger(application.tickIntervalMs) ||
        application.tickIntervalMs < 250 ||
        application.tickIntervalMs > MAX_DURATION_MS)
    ) {
      throw new Error("condition tick interval is out of range");
    }
    if (
      application.tickAmounts !== undefined &&
      application.tickIntervalMs === undefined
    ) {
      throw new Error("condition tick amounts require an interval");
    }
    if (
      application.capacity !== undefined &&
      (!Number.isInteger(application.capacity) ||
        application.capacity < 0 ||
        application.capacity > 1_000_000)
    ) {
      throw new Error("condition capacity is out of range");
    }
  }
}
